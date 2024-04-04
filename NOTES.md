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
the prior outputs are produced.

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
