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
                        self.playerApi = new flashlsAPI($playerElement[0]);
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
    })

})(window, jQuery, console);
