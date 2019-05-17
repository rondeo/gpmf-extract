var MP4Box = require('mp4box');
var readBlock = require('./readBlock');
var mp4boxFile;
var trackId;
var nb_samples;
var gotSamples;

//Will convert the final uint8Array to buffer
function toBuffer(ab) {
  var buf = Buffer.alloc(ab.byteLength);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buf.length; ++i) {
    buf[i] = view[i];
  }
  return buf;
}

module.exports = function(file, isBrowser = false, update) {
  return new Promise(function(resolve, reject) {
    mp4boxFile = MP4Box.createFile(false);
    var uintArr;
    //Will store timing data to help analyse the extracted data
    var timing = {};
    mp4boxFile.onError = function(e) {
      reject(e);
    };

    //When the data is ready, look for the right track
    mp4boxFile.onReady = function(videoData) {
      for (var i = 0; i < videoData.tracks.length; i++) {
        //Find the metadata track. Collect Id and number of samples
        if (videoData.tracks[i].codec == 'gpmd') {
          trackId = videoData.tracks[i].id;
          nb_samples = videoData.tracks[i].nb_samples;
          timing.start = videoData.tracks[i].created;
        } else if (videoData.tracks[i].type == 'video') {
          var vid = videoData.tracks[i];
          //Deduce framerate from video track
          timing.frameDuration = vid.movie_duration / vid.movie_timescale / vid.nb_samples;
        }
      }
      if (trackId != null) {
        //Request the track
        mp4boxFile.setExtractionOptions(trackId, null, {
          nbSamples: nb_samples
        });

        //When samples arrive
        mp4boxFile.onSamples = function(id, user, samples) {
          gotSamples = true;
          var totalSamples = samples.reduce(function(acc, cur) {
            return acc + cur.size;
          }, 0);

          //Save the time and duration of each sample
          timing.samples = [];

          //Store them in Uint8Array
          uintArr = new Uint8Array(totalSamples);
          var runningCount = 0;
          samples.forEach(function(sample) {
            timing.samples.push({ cts: sample.cts, duration: sample.duration });
            for (var i = 0; i < sample.size; i++) {
              uintArr.set(sample.data, runningCount);
            }
            runningCount += sample.size;
          });

          //Convert to Buffer
          var rawData = toBuffer(uintArr);

          //And return it
          resolve({ rawData, timing });
        };
        mp4boxFile.start();
      } else {
        reject('Track not found');
      }
    };

    //Use chunk system in browser
    if (isBrowser) readBlock(file, mp4boxFile, gotSamples, update);
    else {
      //Nodejs
      var arrayBuffer = new Uint8Array(file).buffer;
      arrayBuffer.fileStart = 0;

      //Assign data to mp4box
      mp4boxFile.appendBuffer(arrayBuffer);
    }
  });
};
