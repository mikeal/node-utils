var sys = require('sys')
  , events = require('events');

function createPump (readable, writable) {
  var pump = new events.EventEmitter();
  readable.addListener("data", function (chunk) {
    pump.chunk = chunk;
    pump.emit("data", chunk);
    if (writable.write(pump.chunk) === false) {
      pump.emit("pause");
    }
    pump.chunk = null;
  });
  readable.addListener("drain", function () {
    pump.emit("drain");
    pump.emit("resume");
  });
  readable.addListener("end", function () {
    pump.emit("end");
  });
  writable.addListener("close", function () {
    pump.emit("close");
  });
  
  pump.pauseListener = function () {readable.pause()};
  pump.addListener("pause", pump.pauseListener);
  pump.resumeListener = function () {readable.resume()};
  pump.addListener("resume", pump.resumeListener);
  pump.endListener = function () {writable.end()};
  pump.addListener("end", pump.endListener);
  
  pump.removeDefaults = function ( ) {
    pump.removeListener("pause", pump.pauseListener);
    pump.removeListener("resume", pump.resumeListener);
    pump.removeListener("end", pump.endListener);
  }
  
  return pump;
}

function createMultiPump(readables, writables) {
  var mpump = new events.EventEmitter();
  
  for (var i;i<readables.length;i+=1) {
    readables[i].pumps = [];
  }
  
  var startPump = function (writable) {
    if (writable.readableIndex >= readables.length) {
      mpump.emit("end", writable);
      return;
    }
    var readable = readables[writable.readableIndex]
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

