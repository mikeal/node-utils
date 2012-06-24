var util = require('util')
  , events = require('events');

/*

Experimental

Simplified API for creating a Stream compatible object that can mutate data coming through the stream.

  // Write 4 chunks at a time.
  var b = [];
  var filter = util.createFilter(function (chunk, write) {
    if (!chunk || b.length === 4) {
      b.forEach( function (c) {write(c)} );
    } else {
      b.push(chunk);
    }
  });
  util.pump(readable, filter);
  util.pump(filter, writable);
*/

function Filter(handler) {
  var self = this;
  var write = function(chunk) {
    self.emit('data', chunk)
  }

  self.write = function(chunk) {
    handler(chunk, write);
  }
  self.addListener("end", function() {
    handler(null, write)
  })
};
Filter.prototype.pause = function() {
  this.emit("pause")
}
Filter.prototype.resume = function() {
  this.emit("resume")
}
util.inherits(Filter, events.EventEmitter)

function createFilter (handler) {
  return new Filter(handler);
};

function createMultiPump (readables, writables) {
  var mpump = new events.EventEmitter();
  
  for (var i;i<readables.length;i+=1) {
    readables[i].pumps = [];
    if (i !== 0) {
      var readable = readables[i];
      readable.writers = 0;
      readable.pause();
      readable.buffers = []
      readable.bufferListener = function (chunk) { readable.buffers.push(chunk); }
    }
  }
  
  var startPump = function (writable) {
    if (writable.readableIndex >= readables.length) {
      mpump.emit("end", writable);
      return;
    }
    var readable = readables[writable.readableIndex]
    readable.resume();
    if (readable.writers) {
      readable.writers += 1;
      readable.buffers.forEach(function(chunk){writable.write(chunk)});
      if (readable.writers == writables.length) readable.removeListener("data", readable.bufferListener);
    }
    var pump = createPump(readable, writable);
    readable.pumps.push(pump);
    pump.removeDefaults();
    pump.paused = false;
    pump.addListener('pause', function () {
      pump.paused = true;
      var pcount = 0;
      readable.pumps.forEach(function(p) {if (p.paused) pcount += 1;});
      if (pcount == readable.pumps.length) readable.pause();
    })
    pump.addListener('resume', function () {
      pump.paused = false;
      pump.resumeListener()
    });
    pump.addListener('end', function () {
      writable.readableIndex += 1;
      readables.pumps.splice(readables.pumps.indexOf(pump), 1);
      startPump(writable);
    })
    mpump.emit("pump", pump);
  }
  
  writeables.forEach(function (writable) {
    var self = this;
    writable.readableIndex = 0;
    startPump(writable);
  })
  
  mpump.endListener = function (writable) { writable.end(); };
  mpump.addListener("end", mpump.endListener);
  
  return mpump;
}

exports.Filter = Filter;
exports.createFilter = createFilter;
exports.createMultiPump = createMultiPump;