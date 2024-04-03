# Worker thread pool with RxJS

Recently I worked on an Android project for which I needed to dispatch a large
number of calculations to a pool of background threads and gather the results
in the same order dispatched, even though the background calculations might
not finish in order. Kotlin Flows made this straightforward, because it is part
of their specification that collection does not reorder a Flow. The
calculations can be expressed as a Flow of Deferred values from the thread
pool, and then the next stage of processing can await each Deferred value.

I started to wonder how the same sort of thing might be done in JavaScript
with Web Workers. First, the problem needs to be explicitly stated.

You are given a stream of values and a collection of Web Workers that respond
to each input with the result of the same calculation on that input. Send each
value to one of those workers and produce the stream of corresponding result
values. Each value should be sent to a worker as soon as its predecessors have
been sent and an idle worker is available. Each result should be produced as
soon as it and its predecessors have been produced. In other words, the pool
should be used efficiently.

RxJS does not have built-in support for Web Workers or background processing.
It has a Scheduler interface corresponding to Kotlin's Dispatcher, but there
is no documentation on how to adapt it. I didn't want to reverse-engineer RxJS
if I didn't have to.

My first approach was based on concatMap, which has the desired property of
maintaining order. Unfortunately it also has the undesired property of not
processing the next input until the result of the previous one has been
processed, so there was no concurrency.
