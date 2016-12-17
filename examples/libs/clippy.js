(function(factory, $, _, debug) {

    /**
     * Manages a set of adSkip metadata segments for a given recording playback
     * session.
     *
     * @param mindClient
     * @constructor
     */
    function Clippy(mindClient) {
        this._mindClient = mindClient;
        this._adjustedSegments = null;
        this._segmentList = null;
        this._adjustedSegmentsReady = new $.Deferred();

    }

    // Mind Queries
    //
    var clipMetadataSearchRequest = {
        contentId: "",
        type: "clipMetadataSearch"
    };

    var clipMetadataAdjustRequest = {
        clipMetadataId: "",
        recordingId: "",
        type: "clipMetadataAdjust"
    };

    $.extend(Clippy.prototype, {


        /**
         * Called when startStreamTime is know to adjust the segments to the stream time
         *
         * Clippy segment offset metadata is time in milliseconds since the start of the live cache buffer
         * (not sure why that is so, but it is).  As such Atlas Video and other clients need to adjust this
         * to the start of the stream time (time the recording started in the buffer).
         *
         * This startStreamTime is passed in ID3 timed metadata for transcoded content.
         *
         * When the first timed metadata is received call this method with the value.
         *
         * @param startStreamTime {float} - time (MS) in the Live Cache buffer the recording started (ID3 streamStartTime)
         * @returns {boolean} - true if adjustment was performed.
         */
        adjustSegments: function(startStreamTime) {
            var self = this;

            if (! self._adjustedSegments && self._segmentList) {
                self._adjustedSegments = self._segmentList;

                _.each(self._adjustedSegments, function(segment, index) {
                    segment.endOffset = (segment.endOffset - startStreamTime) / 1000;
                    segment.startOffset = (segment.startOffset - startStreamTime) / 1000;
                    segment.segmentNumber = index;
                });
                self._adjustedSegmentsReady.resolve(self._adjustedSegments);
            }

            return self._adjustedSegmentsReady.state() === "resolved";
        },

        /**
         * Return the Clippy segment containing the streamTime, if any.
         *
         * If none returned and segments are known, you are in an ad.
         *
         * @param streamTime
         * @returns {*} clippy segment:  {endOffset: x, startOffset: y, segmentNumber: n}
         */
        inContentSegment: function(streamTime) {
            var self = this;
            var containedIn = null;

            if (self._adjustedSegmentsReady.state() === "resolved") {
                containedIn = _.find(self._adjustedSegments, function(segment) {
                    return streamTime >= segment.startOffset && streamTime <= segment.endOffset;
                });
            }
            return containedIn;
        },

        /**
         * Returns the nearest content segment to the specified streamTime, note this wraps arround
         * so the segment could be in the past.
         *
         * @param streamTime or null if no segment found
         */
        nextContentSegmentStartOffset: function(streamTime) {
            var self = this;
            var nextContentSegment;

            var containedIn = self.inContentSegment(streamTime);
            if (containedIn) {
                nextContentSegment = self._adjustedSegments[(containedIn.segmentNumber + 1) % self._adjustedSegments.length];
            } else {
                nextContentSegment = _.find(self._adjustedSegments, function(segment) {
                    return streamTime <= segment.startOffset;
                });
            }

            return !!nextContentSegment ? nextContentSegment.startOffset : null;
        },

        /**
         * Return the array of content segment offsets or null if not ready yet or none available.
         *
         * @returns {*}
         */
        getAdjustedSegments: function() {
            return this._adjustedSegmentsReady.state() === "resolved" ? this._adjustedSegments : null;
        },

        /**
         * Get segments that are adds.  Basically inverts the content segments.
         */
        getAdjustedAdSegments: function(streamDuration) {
            var self = this;
            var adSegments;

            var programSegments = self.getAdjustedSegments();
            if (programSegments) {
                adSegments = [];
                var currentAdSegment = {startOffset: 0, endOffset: 0, segmentIndex: 0};

                _.each(programSegments, function(segment, index) {
                    currentAdSegment.endOffset = segment.startOffset;
                    adSegments.push(currentAdSegment);

                    currentAdSegment = {startOffset: segment.endOffset, segmentIndex: index + 1};
                });

                currentAdSegment.endOffset = streamDuration;
                adSegments.push(currentAdSegment);

            }
            return adSegments;
        },


        /**
         * Fetch the Clippy AdSkip Metadata (if any) for the indicated recording/content.
         *
         * @param contentId
         * @param recordingId
         * @returns {*} Promise resolved with the segements or rejected with error or message if no segments found
         */
        fetchAdjustedSegments: function(contentId, recordingId) {
            var self = this;
            var adjustedSegmentsReady = self._adjustedSegmentsReady;

            var mindRpc = self._mindClient;

            if (! self._segmentList) {
                self._adjustedSegmentsReady = new $.Deferred();

                self._adjustedSegments = null;
                self._segmentList = null;

                var clipMetadataSearch = $.extend({}, clipMetadataSearchRequest, {
                    contentId: contentId
                });

                mindRpc.request(clipMetadataSearch, function(metadataResult) {

                    if (metadataResult.type !== "clipMetadataList") {
                        adjustedSegmentsReady.reject(metadataResult);
                    } else {

                        // Find first adSkip type, if any (note this assumes there is only one per content, correct?)
                        //
                        var adSkip = _.find(metadataResult.clipMetadata, function(clipMetadata) {
                            return clipMetadata.segmentType === "adSkip";
                        });

                        // Adjust it to the recording to get the skip segments
                        //
                        if (adSkip) {
                            var clipMetadataAdjust = $.extend({}, clipMetadataAdjustRequest, {
                                clipMetadataId: adSkip.clipMetadataId,
                                recordingId: recordingId
                            });

                            mindRpc.request(clipMetadataAdjust, function(clipMetadataAdjResponse) {

                                if (clipMetadataAdjResponse.type === "error") {
                                    debug.warn("clipMetadataAdjust failed: " + clipMetadataAdjResponse.text, msi);
                                    adjustedSegmentsReady.reject(clipMetadataAdjResponse);
                                } else {
                                    self._segmentList = clipMetadataAdjResponse.segment.sort(function(a, b) {
                                        return a.startOffset - b.startOffset;
                                    });
                                }

                            });
                        } else {
                            adjustedSegmentsReady.reject("No Clip Metadata Available");
                        }
                    }
                });
            }

            return adjustedSegmentsReady.promise();
        }

    });

    factory.Clippy = Clippy;


})(window, jQuery, _, console);

