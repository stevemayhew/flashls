(function(factory, $, debug) {

    /**
     * Play HLS video using either flashls or native HLS Playback
     *
     * @param operation
     * @constructor
     */
    function HlsVideoPlayer(operation) {
        if (operation === 'api') {
            return this._api;
        } else {

        }
    };

    $.extend(HlsVideoPlayer.prototype, {



    });



    $.fn.hlsPlayer = HlsVideoPlayer;

})(window, jQuery, console);
