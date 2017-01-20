//////////////////////////////////////////////////////////////////////
//
// File: hlsplayer.js
//
// Copyright 2016 TiVo Inc. All Rights Reserved.
//
//////////////////////////////////////////////////////////////////////

/*global debug*/                // console_wrapper.js

(function(factory, $, debug) {


    /**
     * Play HLS video using either flashls or native HLS Playback chromeless.
     *
     * @param operation
     * @constructor
     */
    $.widget("tivo.chromelessPlayer", {

        options: {
            bgcolor: "#0",
            width: 720,
            height: 480,
            eventHandlers: {},
            onReady: function(api) {}      // Called back when video player is 'ready' with the 'api' object
        },

        _create: function() {
            var self = this;


            // Test for support for HLS native
            var useNativeHLS = false;
            try {
                var nativeHls = document.createElement('video').canPlayType('application/vnd.apple.mpegURL');

                useNativeHLS = !!nativeHls;
            } catch (err) {
                console.log(err);
            }

            var $playerElement;

            if (useNativeHLS) {
                $playerElement = $('<video class="native-video">');
                self.playerApi = new VideoFlashlsAPI($playerElement[0], self.options.eventHandlers);
            } else {
                $playerElement = $('<embed></embed>');

                var playerId = $playerElement.uniqueId().attr('id').replace(/-/g, '');
                var callbackFunction = 'flashlsCallback' + playerId;

                // Surely this leaks memory...
                window[callbackFunction] = function(eventName, args) {
                    var handlerFn = self.options.eventHandlers[eventName];

                    if (eventName === 'ready') {
                        self.playerApi = new FlashlsAPI($playerElement[0]);
                        self.options.onReady(self.playerApi);
                    }
                    if ($.isFunction(handlerFn)) {
                        handlerFn.apply(self.playerApi, args);
                    }
                };

                $playerElement.attr('bgcolor', self.options.bgcolor);
                $playerElement.attr('width', self.options.width);
                $playerElement.attr('height', self.options.height);
                $playerElement.attr('align', 'middle');
                $playerElement.attr('allowFullScreen', 'true');
                $playerElement.attr('allowScriptAccess', 'sameDomain');
                $playerElement.attr('type', 'application/x-shockwave-flash');
                $playerElement.attr('swliveconnect', 'true');
                $playerElement.attr('wmode', 'window');
                $playerElement.attr('FlashVars', 'callback=' + callbackFunction);
                $playerElement.attr('pluginspage', 'http://www.macromedia.com/go/getflashplayer');
            }

            $(self.element).prepend($playerElement);

            if (useNativeHLS) {
                self.options.onReady(self.playerApi);
            } else {
                $playerElement.attr('src', "../../bin/debug/flashlsChromeless.swf?inline=1");
            }
        }
    });



    var sharedFunctions = {
        /**
         * Parses a TiVo Stream's ID3 tags metadata.
         *
         * The structure of the ID3 tag medatada:
         *
         * typedef enum : int {
         *     eTimedMetadataTagStreamStats = 1,
         *     eTimedMetadataTagDiagStats = 2,
         *     eTimedMetadataTagTimeStats = 3,
         *     eTimedMetadataTagBitrateStats = 4,
         *     eTimedMetadataTagTrackDesc = 5
         * } TimedMetadataTags;
         *
         * #define MAX_TRACKS (6)
         *
         * typedef struct {
         *     uint8_t tag;
         *     uint8_t len;
         *     union {
         *         struct {
         *             uint8_t iHappiness;
         *             uint8_t reserved;
         *             uint16_t iProgramRateKBs;
         *             uint16_t iDVRReadRateKBs;
         *             uint16_t iTranscodeFeedRateKBs;
         *             uint16_t iPictureWidth;
         *             uint16_t iPictureHeight;
         *             uint16_t iTargetBitrateKBs;
         *             uint16_t iQuality;
         *         } __attribute((packed)) streamStats;
         *         struct {
         *             uint64_t pts;
         *             uint16_t iBufferFullness;
         *             uint16_t iReadPercent;
         *         } __attribute((packed)) diagStats;
         *         struct {
         *             uint64_t stime;
         *             uint64_t startStreamTime;
         *         } __attribute((packed)) timeStats;
         *         struct {
         *             uint64_t stime;
         *             uint16_t selectedAudioStreamId;
         *             uint16_t numTracks;
         *             struct {
         *                 uint32_t language;
         *                 uint16_t audioStreamId;
         *                 uint16_t audioServiceMode;
         *             } tracks[MAX_TRACKS];
         *         } __attribute((packed)) trackInfo;
         *     } __attribute((packed));
         * } __attribute((packed)) timedMetadataPayloadItem;
         *
         * typedef struct {
         *     uint8_t version;
         *     timedMetadataPayloadItem payload;
         * } __attribute((packed)) timedMetadataPayload;
         *
         * @param data - TIVO ID3 tag data formatted as described above
         * @returns parsedTimedMetadataPayload - an object that contains info similar in structure to the description above
         * @private
         */
        parseTivoMetadata: function(data) {
            var reader = new DataView(data);
            var tmp = {}; // this objects contains parsed information from timedMetadataPayload
            var offset = 0; // Start of our 'PRIV' tag.
            var nextTagOffset;
            var version;
            var tag;
            var length;
            // Data transmitted in the tags uses both little and big endians and we need to switch between them while parsing
            var littleEndian = true; // make littleEndian true by default

            var TIMED_METADATA_TAG_TYPES = {
                STREAM_STATS: 1,
                DIAG_STATS: 2,
                TIME_STATS: 3,
                BITRATE_STATS: 4,
                TRACK_INFO: 5
            };

            var STREAM_SERVICE_MODES = {
                1: 'commentary',        // Associated service: commentary (C).
                2: 'completeMain',      // Main audio service: complete main (CM).
                3: 'dialogue',          // Associated service: dialogue (D).
                4: 'emergency',         // Associated service: emergency (E).
                5: 'hearingImpaired',   // Associated service: hearing impaired (HI).
                6: 'karaoke',           // Main audio service: karaoke (K).
                7: 'musicAndEffects',   // Main audio service: music and effects (ME).
                8: 'visuallyImpaired',  // Associated service: visually impaired (VI).
                9: 'voiceOver'          // Associated service: voice over (VO).
            };

            function floatFor64Bit(high, low) {
                return low + (high * Math.pow(2, 32));
            }
            debug.log('[Timed Metadata Parser] > start');

            // Get the TiVo ID3 tags version
            version = reader.getUint8(offset++);
            debug.log('[Timed Metadata Parser] > version = ' + version + '; ' + 'readerLength = ' + reader.byteLength + ';');

            // We only support timed metadata versions 2, 3 and 4; skip all other versions
            if (version === 2 || version === 3 || version === 4) {

                // Go through the data making sure that we always have at least the length for a tag and length available
                while (offset + 2 < reader.byteLength) {
                    debug.log('[Timed Metadata Parser] > offset = ' + offset + ';');

                    tag = reader.getUint8(offset++);
                    length = reader.getUint8(offset++);
                    nextTagOffset = offset + length;

                    debug.log('[Timed Metadata Parser] > tag = ' + tag + '; length = ' + length + ';');

                    if(offset + length <= reader.byteLength) {
                        switch (tag) {
                            case TIMED_METADATA_TAG_TYPES.STREAM_STATS:
                                littleEndian = true; // This tag is transmitted using little-endian format
                                tmp.streamStats = {};

                                /* jshint ignore:start */
                                tmp.streamStats.iHappiness = reader.getUint8(offset++);
                                tmp.streamStats.reserved = reader.getUint8(offset++);
                                tmp.streamStats.iProgramRateKBs = reader.getUint16(offset, littleEndian); offset += 2;
                                tmp.streamStats.iDVRReadRateKBs = reader.getUint16(offset, littleEndian); offset += 2;
                                tmp.streamStats.iTranscodeFeedRateKBs = reader.getUint16(offset, littleEndian); offset += 2;
                                tmp.streamStats.iPictureWidth = reader.getUint16(offset, littleEndian); offset += 2;
                                tmp.streamStats.iPictureHeight = reader.getUint16(offset, littleEndian); offset += 2;
                                tmp.streamStats.iTargetBitrateKBs = reader.getUint16(offset, littleEndian); offset += 2;

                                if (version >= 3) {
                                    tmp.streamStats.iQuality = reader.getUint16(offset, littleEndian); offset += 2;
                                }
                                /* jshint ignore:end */

                                break;
                            case TIMED_METADATA_TAG_TYPES.DIAG_STATS:
                                littleEndian = false; // This tag is transmitted using big-endian format
                                if (length !== 12) {
                                    debug.warn('[Timed Metadata Parser] > diagStats length != 12', length);
                                }

                                tmp.diagStats = {};

                                /* jshint ignore:start */
                                // TODO: The following doesn't work. Can't seem to shift by 32 in Javascript. Nothing bigger than a long?
                                tmp.diagStats.pts = (littleEndian) ?
                                    (reader.getUint32(offset + 4, littleEndian) << 32) + reader.getUint32(offset, littleEndian) :
                                    (reader.getUint32(offset, littleEndian) << 32) + reader.getUint32(offset + 4, littleEndian);
                                offset += 8;

                                tmp.diagStats.iBufferFullness = reader.getUint16(offset, littleEndian); offset += 2;
                                tmp.diagStats.iReadPercent = reader.getUint16(offset, littleEndian); offset += 2;
                                /* jshint ignore:end */

                                break;
                            case TIMED_METADATA_TAG_TYPES.TIME_STATS:
                                littleEndian = false; // This tag is transmitted using big-endian format
                                if (length !== 16) {
                                    debug.warn('[Timed Metadata Parser] > timeStats length != 16', length);
                                }

                                tmp.timeStats = {stime: {}};

                                /* jshint ignore:start */
                                tmp.timeStats.stime.hi = reader.getUint32(offset, littleEndian); offset += 4;
                                tmp.timeStats.stime.lo = reader.getUint32(offset, littleEndian); offset += 4;

                                tmp.timeStats.stime.valms = floatFor64Bit(tmp.timeStats.stime.hi, tmp.timeStats.stime.lo) / 1000000.0;


                                if (version >= 4) {
                                    tmp.timeStats.startStreamTime = {};
                                    tmp.timeStats.startStreamTime.hi = reader.getUint32(offset, littleEndian); offset += 4;
                                    tmp.timeStats.startStreamTime.lo = reader.getUint32(offset, littleEndian); offset += 4;
                                    tmp.timeStats.startStreamTime.valms =
                                        floatFor64Bit(tmp.timeStats.startStreamTime.hi, tmp.timeStats.startStreamTime.lo) / 1000000.0;

                                }


                                debug.log('[Timed Metadata Parser] > startStreamTime: ' +  tmp.timeStats.startStreamTime.valms + " stime: " + tmp.timeStats.stime.valms);
                                /* jshint ignore:end */

                                break;
                            case TIMED_METADATA_TAG_TYPES.BITRATE_STATS:
                                littleEndian = true; // This tag is transmitted using little-endian format
                                if (length !== 4) {
                                    debug.warn('[Timed Metadata Parser] > bitrateStats length != 4', length);
                                }

                                tmp.bitrateStats = {};

                                /* jshint ignore:start */
                                tmp.bitrateStats.iTargetBitrateKbs = reader.getUint32(offset, littleEndian); offset += 4;
                                /* jshint ignore:end */

                                break;

                            default:
                                offset += length;
                                break;
                        }
                    }

                    // To make sure that even if we did not read all the content advertised by the length of a tag
                    // we can still move on to the next tag, move the offset the full length of the tag
                    offset = nextTagOffset;
                }
            }

            debug.log('[Timed Metadata Parser] > Result:', tmp);
            debug.log('[Timed Metadata Parser] > end');

            return tmp;
        }
    };

    function FlashlsAPI(flashObject) {
        this.flashObject = flashObject;
    }

    $.extend(FlashlsAPI.prototype, sharedFunctions, {
        load: function(url) {
            this.flashObject.playerLoad(url);
        },

        play: function(offset) {
            this.flashObject.playerPlay(offset);
        },

        pause: function() {
            this.flashObject.playerPause();
        },

        resume: function() {
            this.flashObject.playerResume();
        },

        seek: function(offset) {
            this.flashObject.playerSeek(offset);
        },

        stop: function() {
            this.flashObject.playerStop();
        },

        volume: function(volume) {
            this.flashObject.playerVolume(volume);
        },

        setCurrentLevel: function(level) {
            this.flashObject.playerSetCurrentLevel(level);
        },

        setNextLevel: function(level) {
            this.flashObject.playerSetNextLevel(level);
        },

        setLoadLevel: function(level) {
            this.flashObject.playerSetLoadLevel(level);
        },

        setMaxBufferLength: function(len) {
            this.flashObject.playerSetmaxBufferLength(len);
        },

        getPosition: function() {
            return this.flashObject.getPosition();
        },

        getDuration: function() {
            return this.flashObject.getDuration();
        },

        getbufferLength: function() {
            return this.flashObject.getbufferLength();
        },

        getbackBufferLength: function() {
            return this.flashObject.getbackBufferLength();
        },

        getLowBufferLength: function() {
            return this.flashObject.getlowBufferLength();
        },

        getMinBufferLength: function() {
            return this.flashObject.getminBufferLength();
        },

        getMaxBufferLength: function() {
            return this.flashObject.getmaxBufferLength();
        },

        getLevels: function() {
            return this.flashObject.getLevels();
        },

        getAutoLevel: function() {
            return this.flashObject.getAutoLevel();
        },

        getCurrentLevel: function() {
            return this.flashObject.getCurrentLevel();
        },

        getNextLevel: function() {
            return this.flashObject.getNextLevel();
        },

        getLoadLevel: function() {
            return this.flashObject.getLoadLevel();
        },

        getAudioTrackList: function() {
            return this.flashObject.getAudioTrackList();
        },

        getStats: function() {
            return this.flashObject.getStats();
        },

        setAudioTrack: function(trackId) {
            this.flashObject.playerSetAudioTrack(trackId);
        },

        playerSetLogDebug: function(state) {
            this.flashObject.playerSetLogDebug(state);
        },

        getLogDebug: function() {
            return this.flashObject.getLogDebug();
        },

        playerSetLogDebug2: function(state) {
            this.flashObject.playerSetLogDebug2(state);
        },

        getLogDebug2: function() {
            return this.flashObject.getLogDebug2();
        },

        playerSetUseHardwareVideoDecoder: function(state) {
            this.flashObject.playerSetUseHardwareVideoDecoder(state);
        },

        getUseHardwareVideoDecoder: function() {
            return this.flashObject.getUseHardwareVideoDecoder();
        },

        playerSetflushLiveURLCache: function(state) {
            this.flashObject.playerSetflushLiveURLCache(state);
        },

        getflushLiveURLCache: function() {
            return this.flashObject.getflushLiveURLCache();
        },

        playerSetJSURLStream: function(state) {
            this.flashObject.playerSetJSURLStream(state);
        },

        getJSURLStream: function() {
            return this.flashObject.getJSURLStream();
        },

        playerCapLeveltoStage: function(state) {
            this.flashObject.playerCapLeveltoStage(state);
        },

        getCapLeveltoStage: function() {
            return this.flashObject.getCapLeveltoStage();
        },

        playerSetAutoLevelCapping: function(level) {
            this.flashObject.playerSetAutoLevelCapping(level);
        },

        getAutoLevelCapping: function() {
            return this.flashObject.getAutoLevelCapping();
        }
    });


    /**
     * Player API for the Native Video element.
     *
     * @param videoElement
     * @param flashlsEvents
     * @constructor
     */
    function VideoFlashlsAPI(videoElement, flashlsEvents) {
        var self = this;
        self._video = videoElement;
        self._flashlsEvents = flashlsEvents;

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

            if (flashlsEvents && flashlsEvents.videoSize && self._video.videoWidth > 0) {
                flashlsEvents.videoSize(self._video.videoWidth, self._video.videoHeight);
            }
        });

        videoElement.addEventListener('loadedmetadata', function(event) {
            debug.log("Video loadedmetadata, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);

            if (flashlsEvents && flashlsEvents.videoSize && self._video.videoWidth > 0) {
                flashlsEvents.videoSize(self._video.videoWidth, self._video.videoHeight);
            }
        });

        videoElement.addEventListener('durationchange', function(event) {
            debug.log("Video durationchange, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);

            self.durationChangedEvent(event);
        });

        videoElement.addEventListener('timeupdate', function(event) {
            //debug.log("Video timeupdate, readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);

            if (! self._hasMetaListener) {
                var tracks = self._video.textTracks;
                _.each(tracks, function(track) {
                    //debug.info("track", track);
                    if (track.kind === "metadata") {
                        track.mode = "hidden";      // This turns on cue events.

                        self._hasMetaListener = true;
                        self._metadataCueEvent(track.activeCues);

                        track.addEventListener('cuechange', function(cueChange) {
                            self._metadataCueEvent(this.activeCues);
                        });
                    }
                });
            }

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
            debug.warn("Video error.  Error: "+ videoElement.error +" error code: "+videoElement.error.code +
                       ", readyState:"+videoElement.readyState+", networkState:"+videoElement.networkState, event);
        });
    }

    $.extend(VideoFlashlsAPI.prototype, sharedFunctions, {
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
        },

        getbackBufferLength: function() {
        },

        getLowBufferLength: function() {
        },

        getMinBufferLength: function() {
        },

        getMaxBufferLength: function() {
        },

        getLevels: function() {
        },

        getAutoLevel: function() {
        },

        getCurrentLevel: function() {
        },

        getNextLevel: function() {
        },

        getLoadLevel: function() {
        },

        getAudioTrackList: function() {
        },

        getStats: function() {
        },

        setAudioTrack: function(trackId) {

        },

        playerSetLogDebug: function(state) {

        },

        getLogDebug: function() {
        },

        playerSetLogDebug2: function(state) {

        },

        getLogDebug2: function() {
        },

        playerSetUseHardwareVideoDecoder: function(state) {

        },

        getUseHardwareVideoDecoder: function() {
        },

        playerSetflushLiveURLCache: function(state) {

        },

        getflushLiveURLCache: function() {
        },

        playerSetJSURLStream: function(state) {

        },

        getJSURLStream: function() {
        },

        playerCapLeveltoStage: function(state) {

        },

        getCapLeveltoStage: function() {
        },

        playerSetAutoLevelCapping: function(level) {
        },

        getAutoLevelCapping: function() {
        },

        durationChangedEvent: function(event) {
        },

        setSize: function(width, height) {
            this._video.width = width;
            this._video.height = height;
        },

        /**
         * Event when called when the Metadata (ID3) TextTrack queue is updated.  This either
         * comes native from the HLS player in Safari Video Element, as documented here:
         * http://www.w3.org/TR/2011/WD-html5-20110405/video.html#timed-text-tracks
         * Or it is simulated by the MediaElementJS player with ActionScript / JS code.
         *
         *
         * @param activeCues TextTrackCueList - http://www.w3.org/TR/2011/WD-html5-20110405/video.html#texttrackcuelist
         * @private
         */
        _metadataCueEvent: function (activeCues) {
            var self = this;

            _.each(activeCues, function(textTrackCue) {
                //debug.info(textTrackCue);
                var metadata = self._processId3Metadata(textTrackCue);

                if (self._flashlsEvents && self._flashlsEvents.id3Metadata && metadata) {
                    self._flashlsEvents.id3Metadata(metadata);
                }
            });
        },

        /**
         * Process a TextTrackCue with ID3 metadata. This method figures out if it's TiVo metadata and if so post a change
         * to playback monitor.
         * It is possible that other ID3 metadata could come here form various playback sources.
         * If it's not valid TiVo data we ignore it.
         *
         * @param textTrackCue
         * @private
         */
        _processId3Metadata: function (textTrackCue) {
            var self = this;
            var frameId = textTrackCue.value.key;
            var ownerId = textTrackCue.value.info;
            var data = textTrackCue.value.data;

            if (frameId === 'PRIV' && ownerId === 'TiVo') {
                // STATS tags come in every 5 seconds but TRACK_INFO tags come in much more frequently than that.
                // We cannot simply throttle this callback because it is likely we'll miss STATS tags. The overhead
                // of constantly parsing tags does not seem to affect performance.
                return self.parseTivoMetadata(data);
            }
        }
    });

})(window, jQuery, console);
