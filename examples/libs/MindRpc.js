(function(factory, $, debug) {
    factory.MindRpc = function(config) {
        var schemaVersion = 15;
        this.mSecure = 0;
        this.mPort = 0;
        this.mStandardHeaders = ["Content-type: application/json"];
        this.mWs = null;
        this.mMaxRpcId = 0;
        this.mListeners = {};

        config = config || {};

        if (!!config.secure) {
            this.mSecure = config.secure;
        }
        if (!!config.host) {
            this.mHost = config.host;
        }
        if (!!config.port) {
            this.mPort = config.port;
        }
        if (!!config.schemaVersion) {
            schemaVersion = config.schemaVersion;
        }
        if (!!config.appName) {
            this.mStandardHeaders.push("ApplicationName: " + config.appName);
        }
        if (!!config.appVersion) {
            this.mStandardHeaders.push("ApplicationVersion: " + config.appVersion);
        }
        if (!!config.appSessionId) {
            this.mStandardHeaders.push("ApplicationSessionId: " + config.appSessionId);
        }
        if (!!config.hwPlatform) {
            this.mStandardHeaders.push("HardwarePlatform: " + config.hwPlatform);
        }
        if (!!config.hwId) {
            this.mStandardHeaders.push("HardwareIdentifier: " + config.hwId);
        }

        // always add a schema version
        this.mStandardHeaders.push("SchemaVersion: " + schemaVersion);

        // empty line separator (need two to get final \r\n)
        this.mStandardHeaders.push("");
        this.mStandardHeaders.push("");
    };

    $.extend(MindRpc.prototype, {

        start: function() {
            var result = new $.Deferred();
            var self = this;


            if (!("WebSocket" in window)) {
                var message = "WebSocket not supported by your browser!";
                debug.error(message);
                result.reject(-1, message);
            } else {

                self.stop();

                var url = (this.mSecure ? "wss" : "ws") + "://";
                url += this.mHost + (this.mPort ? (":" + this.mPort) : "");

                try {
                    this.mWs = new WebSocket(url, "com.tivo.mindrpc.2");
                }
                catch (err) {
                    result.reject(-1, "WebSocket create failed" + err);
                    debug.error("Unable to open websocket", err);
                }

                this.mWs.onopen = function() {
                    if (result.state() === "pending") {
                        result.resolve(self);
                    }
                };
                this.mWs.onmessage = function(event) {
                    self.onmessage(event);
                };
                this.mWs.onerror = function(event) {
                    self.onerror(event);
                };
                this.mWs.onclose = function(event) {
                    if (self.connectionTimer) {
                        clearTimeout(self.connectionTimer);
                        self.connectionTimer = null;
                    }
                    if (self.monitorPromise) {
                        self.monitorPromise.reject(self.mWs.readyState, "onclosed");
                        self.monitorPromise = null;
                    }

                    self.listeners = [];
                    self.onclose(event);
                };

            }

            if (self.mWs.readyState === 1 && result.state() === "pending") {
                result.resolve(self);
            }

            return result.promise();
        },

        stop: function() {
            if (self.mWs) {
                try {
                    self.mWs.close();
                } catch (err) {
                    debug.error("Unable to close websocket: " + err);
                }
            }
        },

        monitorConnection: function(pollTime) {
            var monitor = this.monitorPromise;
            var self = this;

            pollTime = pollTime ? Math.max(4000, pollTime) : 4000;

            function setPollForTimeout() {
                //debug.log("Restarting timeout poll at %s, pollTime %d", new Date(), pollTime);
                if (self.connectionTimer) {
                    clearTimeout(self.connectionTimer);
                }
                self.connectionTimer = setTimeout(function() {
                    debug.log("Poll timeout! at %s", new Date());
                    if (monitor.state() === "pending") {
                        monitor.reject(self.mWs.readyState, "timeout");
                    } else {
                        debug.log("Poll already reported");
                    }
                }, pollTime);
            }

            if (! monitor) {
                monitor = new $.Deferred();
                setPollForTimeout();
                self.requestMonitoring({type: "ping", response: {type: "pong"}}, function(response) {
                    //debug.log("ping response", response);
                    setPollForTimeout();
                });
            }
            return monitor;
        },

        request: function(mdo, listener, appFeatureArea) {
            var rpcId = ++this.mMaxRpcId;

            this.mListeners[rpcId] = listener;

            this.sendRequest("request", rpcId, mdo, "single", appFeatureArea);
            return rpcId;
        },

        requestMonitoring: function(mdo, listener, appFeatureArea) {
            var rpcId = ++this.mMaxRpcId;

            this.mListeners[rpcId] = listener;

            this.sendRequest("request", rpcId, mdo, "multiple", appFeatureArea);
            return rpcId;
        },

        fireAndForget: function(mdo, appFeatureArea) {
            this.sendRequest("request", ++this.mMaxRpcId, mdo, "none", appFeatureArea);
        },

        requestUpdate: function(rpcId, mdo) {
            this.sendRequest("requestUpdate", rpcId, mdo, null, null);
        },

        cancelRequest: function(rpcId) {
            var headerArray = [
                "Type: cancel",
                "RpcId: " + rpcId,
                "", "" // need two to get final \r\n
            ];

            var header = headerArray.join("\r\n");
            var msg = "MRPC/2 " + header.length + " 0\r\n" + header;

            try {
                this.mWs.send(msg);
            } catch (e) {
                debug.log("ignoring error sending MindRPC cancel request. WS readyState %d", this.mWs, e);
            }

            // forget listener
            this.mListeners[rpcId] = null;
        },

        sendRequest: function(type, rpcId, mdo, responseCount, appFeatureArea) {
            var headerArray = [
                "Type: " + type,
                "RpcId: " + rpcId,
                "RequestType: " + mdo.type,
                "ResponseCount: " + responseCount
            ];

            if (!!appFeatureArea) {
                headerArray.push("ApplicationFeatureArea: " + appFeatureArea);
            }

            headerArray = headerArray.concat(this.mStandardHeaders);

            var header = headerArray.join("\r\n");

            var body = JSON.stringify(mdo);

            var msg = "MRPC/2 " + header.length + " " + body.length + "\r\n" + header + body;

            try {
                this.mWs.send(msg);
            } catch (e) {
                debug.error("Websocket send failed: ", e);
                this.onerror();
            }
        },

        onmessage: function(event) {
            // parse pre-header
            var preheader = String(event.data.split("\r\n", 1));
            var preheaderParts = preheader.split(" ");

            // extract header
            var header = event.data.substr(preheader.length + 2 /* skip newline */,
                preheaderParts[1] - 4 /* ignore blank line */);

            // extract body
            var body = event.data.substr(preheader.length + 2 /* skip newline */ + Number(preheaderParts[1]));

            if (body.length != preheaderParts[2]) {
                debug.warn("Marshalled data mismatch: body length = " + body.length + ", header said = " + preheaderParts[2]);
            }

            // parse header for RpcId and IsFinal
            var headerParts = header.split("\r\n");
            var rpcId = 0;
            var isFinal = true;
            for (var i in headerParts) {
                var headerPart = headerParts[i];
                var tag = headerPart.split(":", 1);
                if (tag == "RpcId") {
                    rpcId = parseInt(headerPart.slice(6), 10);
                }

                if (tag == "IsFinal") {
                    isFinal = (headerPart.slice(8) == 'true');
                }
            }

            if (rpcId > 0 && this.mListeners[rpcId]) {
                // unmarshal response
                var mdo;
                try {
                    mdo = JSON.parse(body);
                } catch (e) {
                    debug.warn("Unparseable JSON body for RPCid: "+rpcId+" error:", e);
                }
                this.mListeners[rpcId](mdo, isFinal);
                if (isFinal) {
                    // clear listener if no more responses
                    this.mListeners[rpcId] = null;
                }
            }
        },

        onerror: function(event) {
            debug.warn("Internal server connection error (WebSockets)");
        },

        onclose: function(event) {
            debug.log("Websocket onclose", event);
        }
    });
})(window, jQuery, console);



