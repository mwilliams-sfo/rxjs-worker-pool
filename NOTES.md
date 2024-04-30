# Worker thread pool with RxJS

Recently I worked on an Android project for which I needed to dispatch a large
number of calculations to a pool of background threads and gather the results
in the same order dispatched, even though the background calculations might
not finish in order. Kotlin Flows made this straightforward, because it is part
of their specification that collection does not reorder a Flow. The
calculations can be expressed as a Flow of Deferred values from the thread
pool, and then the next stage of processing can await each Deferred value.

I started to wonder how the same sort of thing might be done in JavaScript
with Web Workers.

## Problem statement

You are given a stream of values and a collection of Web Workers that respond
to each input with the result of the same calculation on that input. Send each
value to one of those workers and produce the stream of corresponding result
values. Each value should be sent to a worker as soon as its predecessors have
been sent and an idle worker is available. Each result should be produced as
soon as it and its predecessors have been produced. In other words, the pool
should be used efficiently.

## Solution 1: concatMap

RxJS does not have built-in support for Web Workers or background processing.
It has a Scheduler interface corresponding to Kotlin's Dispatcher, but there
is no documentation on how to adapt it. I didn't want to reverse-engineer RxJS
if I didn't have to.

My first approach was based on concatMap, which has the desired property of
maintaining order. Unfortunately it also has the undesired property of not
processing the next input until the result of the previous one has been
processed, so there was no concurrency.

## Solution 2: zip

The next idea was to zip the input together with an observable that supplies
idle workers as available. At first this appeared successful; all of the
workers were supplied, but then at the end they were not released back to
the pool. Logging indicated that there was some concurrency for the first few
values, but then none as the workers were not recycled.

## Analysis

What am I trying to achieve here? The processor should produce an Observable
that, when subscribed, begins dispatching input values to workers until all
workers are in use. It maintains a queue of pending calculations represented
as Observables. When that queue is full, the processor waits for the oldest
calculation to produce a value and then emits it downstream. Each calculation
should release its worker as it completes.

Since ordinary Observables do nothing before they are subscribed, they are
insufficient for representing the calculation in progress. Likewise, concatMap
relies on ordinary Observables, each of which is not subscribed before it is
needed, so it too is insufficient. Likely a BehaviorSubject is needed to catch
the result of each calculation and hold it. However BehaviorSubject can also
replay a value, so some care is needed to avoid releasing a worker to the pool
twice.

This seems to lead to a paradox: I cannot use map, because it requires a
synchronous result and each value needs to wait asynchronously for a worker.
The most obvious alternative is concatMap, but it processes each input only
after the prior outputs are produced.

The use of BehaviorSubject also seems to involve a paradox. I want to use
BehaviorSubjects so that results are captured before they are subscribed to,
but BehaviorSubject requires a default value (e.g. undefined). I do not want
that default value in the output, so I have to add a filter to the
BehaviorSubject to discard the default value.

One way around the paradox involving map is to create a BehaviorSubject, start
the calculation, and then return the subject. This introduces another bug.
When the processor runs out of available workers, it should stop accepting
input until another worker is available for that particular input. Instead,
this approach immediately requests workers for all remaining inputs. Maybe
the problem in this regard is that I always wait for a worker, rather than
first checking synchronously whether one is available.

## Solution 3: zip improved

Not seeing a way around these paradoxes, I went back to the zip approach and
tried to fix the worker leak. This involved mainly a lot of factoring to leave
fewer hiding places for bugs. Eventually I got it to work perfectly. All
workers are used, all of them return to the pool at the end, and all of the
outputs are in order.

## Lessons learned

- It's easier to keep related Observables consistent by deriving the ones that
  can be derived with operators.
- A complex Observable/operator should be replaced with simple interconnected
  Observables/operators
- RxJS provides robust support to avoid resource leaks.
- BehaviorSubjects are useful for bridging synchronous and reactive styles.

## Plugging the leaks

Despite the correct behavior, I remained unsatisfied with the approach of
zipping the input with an endless stream of acquired workers. It does not
explicitly prevent a worker from being acquired when there is no value to work
on. Since worker release is tied to value dispatch, this can result in a leak.

Once again I got into the same paradoxes as before: the processor should
proceed readily when a value and a worker are available, but not when only a
worker is available. Many different approaches were tried and failed. The key
idea that led to a working solution was zipping each value with a *single*
worker request. When that worker becomes available, the value is dispatched to
it and a subject is created to catch the result. This ensures that dispatch
occurs only under the stated conditions.

Despite the improvement, I could not factor out a method specifically for
processing each value. Attempting to do so returns to the previous incorrect
behavior of using only one worker. Having two concatMap operations that
separately acquire a worker and then dispatch to it appears to introduce a
scheduling point that is necessary to allow other values through. If I put
these operations within an enclosing concatMap, the input is blocked.

## Flow control (backpressure)

When I added logging during further investigations, I noticed that the worker
acquisition does not prevent the input from generating arbitrarily many values
as I had assumed that it did. This makes the pool unsuitable for the type of
application I originally had in mind, which would dispatch of thousands of
values corresponding to pixels in a canvas. The processor should be able to
control the input flow.

ReactiveX specifies flow control (called backpressure) as an optional feature.
RxJS supported it in version 4 but does not in the latest version. However, I
can implement it myself by passing a signaling function along with the input.
When the processor acquires a worker for the most recent input value, it can
call the signalling function to request another value, which when delivered
will trigger another worker acquisition. This way the input rate is limited by
worker availability.

Why doesn't RxJS support backpressure? The developers say that a reactive
stream should be able to push notifications at leisure. If the consumer can
block it, then it is not really reactive and is more suitably modeled as an
iterable. Accordingly, I modified the processor further to accept iterable
input using the ix library.

## Further lessons

- concatMap is appropriate for a strictly sequential process that may consume
  an indefinite amount of the input.
- If an exact amount of input must be processed, iterables are more suitable.
- If concurrency is needed, a pipeline of multiple stages is more suitable.
  Compare Hoare's COPY program in CSP.

I remain unpersuaded by the RxJS developers' view on backpressure. It appears
to apply specifically to this case where I want to the input to send values
only as fast as I can acquire workers for them. Backpressure enables a process
to manage an internal flow limit that is unknown to the producer and the
consumer. It informs a producer that while it may *produce*, it should not
*emit*.

## Reactive streams

Why stop there: knowing that backpressure is the solution, but not doing
anything about it? ReactiveX recommends RxJava, which supports backpressure
in its Flowable class, but it does not recommend a similarly capable
JavaScript library. There is a library called RSocket that allegedly
supports backpressure, but the extent of its support is poorly documented.

A contract for flows with backpressure is documented in the Reactive Streams
specification, which is much easier to understand than reverse-engineering
RxJava or Reactor. Based on this, I decided to implement reactive streams in
JavaScript for my purposes. It was challenging, but not overwhelming. Among
the tricks that were used:

- Demand signalling as buffer control: My terminal subscriber initially
  requests not just one value from the worker pool processor, but as many
  as the number of workers. This demand propagates upstream so that the input
  generator generates just that many values into the processor's buffer and
  stops until more demand arrives. This provides the buffering that has been
  absent in prior implementations.
- Fulfillment loops: As soon as a Publisher's demand exceeds zero, it starts
  a loop (an asynchronous code block) to fulfill the demand. The loop delivers
  values until the Publisher is cancelled, or the demand is fulfilled, or
  there is nothing more to deliver. This avoids mutual recursion between
  request and onNext, as the specification requires. When demand is exhausted,
  the loop quits.
- Multi-stage fulfillment through the worker pool: Values provided to the
  worker pool processor are placed in a queue for a loop that matches them
  with a worker. They are dispatched to that worker, and the worker and the
  dispatch are placed in a second queue for another loop. That loop waits for
  the next result, releases the worker, and emits the result downstream. This
  allows simultaneous waiting for a worker and for a result, something that
  has not been present in previous implementations.

Only three publishers were necessary: one to emit values from an async
generator; another that logs those values as they are emitted; and a third
to process them through the pool. Arguably, the internal stages of my pool
processor are really two processors (as in the RxJS implementation), and with
further effort I might separate them accordingly.

Further directions to go:

- Factor the common behavior of publishers, subscribers and subscriptions for
  reuse. They have been reimplemented in each class, resulting in much
  inconsistency and churn.
- Separate the pool processing stages as mentioned above. The stages will both
  need a reference to the pool so that one can acquire and the other can
  release.
- Eliminate RxJS. I still use for condition signalling to indicate that a
  worker is available, and this should be easy to replace.
- Implement stages as processors, not as wrapper-publishers like I have now.
