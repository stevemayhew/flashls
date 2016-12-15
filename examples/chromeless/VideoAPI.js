(function(factory, $, debug) {

    function VideoFlashlsAPI(videoElement, flashlsEvents) {
        var self = this;
        self._video = videoElement;

        videoElement.addEventListener('loadstart', function(event) {
            debug.log("Video loadstart event, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);
        });

        videoElement.addEventListener('loadeddata', function(event) {
            debug.log("Video loadeddata event, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);
        });

        videoElement.addEventListener('canplay', function(event) {
            debug.log("Video canplay, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);
        });

        videoElement.addEventListener('canplaythrough', function(event) {
            debug.log("Video canplaythrough, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);
        });

        videoElement.addEventListener('loadedmetadata', function(event) {
            debug.log("Video loadedmetadata, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);

            if (flashlsEvents && flashlsEvents.videoSize) {
                flashlsEvents.videoSize(self._video.videoWidth, self._video.videoHeight);
            }
        });

        videoElement.addEventListener('durationchange', function(event) {
            debug.log("Video durationchange, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);

            self.durationChangedEvent(event);
        });

        videoElement.addEventListener('timeupdate', function(event) {
            //debug.log("Video timeupdate, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);

            if (flashlsEvents && flashlsEvents.position) {

                var timemetrics = {};
                timemetrics.position = self.getPosition();
                timemetrics.duration = self.getDuration();

                var buffer = self._video.buffered;
                if (buffer && buffer.length > 0) {
                    var start = buffer.start(0);
                    var end = buffer.end(0);

                    timemetrics.buffer = end - start;
                    timemetrics.backbuffer = Math.max(0, timemetrics.position - start);
                } else {
                    timemetrics.buffer = 0;
                    timemetrics.backbuffer = 0;
                }
                timemetrics.live_sliding_main = 0;
                timemetrics.watched = 0;


                flashlsEvents.position(timemetrics, event);
            }
        });

        videoElement.addEventListener('error', function(event) {
//                $videoElement.toggleClass('loaded', true);
            $videoElement.addClass("error");
            debug.warn("Video error.  Error: "+ videoElement.error +" error code: "+videoElement.error.code +
                       ", readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);
        });
    }

    $.extend(VideoFlashlsAPI.prototype, {
        load: function(url) {
            this._video.src = url;
        },

        play: function(offset) {
            this.seek(offset);
            this._video.play();
        },

        pause: function() {
            this._video.pause();
        },

        resume: function() {
            this._video.play();
        },

        seek: function(offset) {
            var value = parseFloat(offset);
            if (! isNaN(value)) {
                this._video.currentTime = offset;
            }
        },

        stop: function() {
            this._video.pause();
        },

        volume: function(volume) {

        },

        setCurrentLevel: function(level) {

        },

        setNextLevel: function(level) {

        },

        setLoadLevel: function(level) {

        },

        setMaxBufferLength: function(len) {

        },

        getPosition: function() {
            return this._video.currentTime;
        },

        getDuration: function() {
            return this._video.duration;
        },

        getbufferLength: function() {
            return
        },

        getbackBufferLength: function() {
            return
        },

        getLowBufferLength: function() {
            return
        },

        getMinBufferLength: function() {
            return
        },

        getMaxBufferLength: function() {
            return
        },

        getLevels: function() {
            return
        },

        getAutoLevel: function() {
            return
        },

        getCurrentLevel: function() {
            return
        },

        getNextLevel: function() {
            return
        },

        getLoadLevel: function() {
            return
        },

        getAudioTrackList: function() {
            return
        },

        getStats: function() {
            return
        },

        setAudioTrack: function(trackId) {

        },

        playerSetLogDebug: function(state) {

        },

        getLogDebug: function() {
            return
        },

        playerSetLogDebug2: function(state) {

        },

        getLogDebug2: function() {
            return
        },

        playerSetUseHardwareVideoDecoder: function(state) {

        },

        getUseHardwareVideoDecoder: function() {
            return
        },

        playerSetflushLiveURLCache: function(state) {

        },

        getflushLiveURLCache: function() {
            return
        },

        playerSetJSURLStream: function(state) {

        },

        getJSURLStream: function() {
            return
        },

        playerCapLeveltoStage: function(state) {

        },

        getCapLeveltoStage: function() {
            return
        },

        playerSetAutoLevelCapping: function(level) {

        },

        getAutoLevelCapping: function() {
            return
        },

        //////  Unique to Video element API

        durationChangedEvent: function(event) {

        },

        setSize: function(width, height) {
            this._video.width = width;
            this._video.height = height;
        }
    });

    factory.VideoFlashlsAPI = VideoFlashlsAPI;
})(window, jQuery, console);

