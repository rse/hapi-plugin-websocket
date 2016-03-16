
hapi-plugin-websocket
=====================

[HAPI](http://hapijs.com/) plugin for seamless WebSocket integration.

<p/>
<img src="https://nodei.co/npm/hapi-plugin-websocket.png?downloads=true&stars=true" alt=""/>

<p/>
<img src="https://david-dm.org/rse/hapi-plugin-websocket.png" alt=""/>

Installation
------------

```shell
$ npm install hapi hapi-plugin-websocket
```

About
-----

This is a small plugin for the [HAPI](http://hapijs.com/) server
framework for seamless WebSocket protocol integration. It accepts
WebSocket connections and transforms incoming/outgoing messages into
injected HTTP request/response messages.

Usage
-----

The following sample server shows all features at once:

```js
var Boom          = require("boom")
var HAPI          = require("hapi")
var HAPIWebSocket = require("./hapi-plugin-websocket")

var server = new HAPI.Server()
server.connection({ address: "127.0.0.1", port: 12345 })
server.register(HAPIWebSocket, () => {

    /*  plain REST route  */
    server.route({
        method: "POST", path: "/foo",
        config: {
            payload: { output: "data", parse: true, allow: "application/json" },
        },
        handler: (request, reply) => {
            reply({ at: "foo", seen: request.payload })
        }
    })

    /*  combined REST/WebSocket route  */
    server.route({
        method: "POST", path: "/bar",
        config: {
            payload: { output: "data", parse: true, allow: "application/json" },
            plugins: { websocket: true }
        },
        handler: (request, reply) => {
            if (request.websocket())
                reply({ at: "bar", type: "websocket", seen: request.payload })
            else
                reply({ at: "bar", type: "rest", seen: request.payload })
        }
    })

    /*  exclusive WebSocket route  */
    server.route({
        method: "POST", path: "/baz",
        config: {
            plugins: { websocket: { only: true } }
        },
        handler: (request, reply) => {
            reply({ at: "baz", seen: request.payload })
        }
    })

    /*  full-featured exclusive WebSocket route  */
    server.route({
        method: "POST", path: "/quux",
        config: {
            plugins: {
                websocket: {
                    only: true,
                    connect: (wss, ws) => {
                        ws.send(JSON.stringify({ cmd: "WELCOME" }))
                        this.to = setInterval(() => {
                            ws.send(JSON.stringify({ cmd: "PING" }))
                        }, 5000)
                    },
                    disconnect: (wss, ws) => {
                        if (this.to !== null) {
                            clearTimeout(this.to)
                            this.to = null
                        }
                    }
                }
            }
        },
        handler: (request, reply) => {
            if (typeof request.payload.cmd !== "string")
                return reply(Boom.badRequest("invalid request"))
            if (request.payload.cmd === "PING")
                return reply({ result: "PONG" })
            else if (request.payload.cmd === "AWAKE-ALL") {
                var wss = request.websocket().wss
                wss.clients.forEach((ws) => {
                    ws.send(JSON.stringify({ cmd: "AWAKE" }))
                })
                return reply().code(204)
            }
            else
                return reply(Boom.badRequest("unknown command"))
        }
    })

    server.start()
})
```

You can test-drive this the following way (with the help
of [curl](https://curl.haxx.se/) and [wscat](https://www.npmjs.com/package/wscat)):

```shell
# start the sample server implementation (see source code above)
$ node sample-server.js &

# access the plain REST route via REST
$ curl -X POST --header 'Content-type: application/json' \
  --data '{ "foo": 42 }' http://127.0.0.1:12345/foo
{"at":"foo","seen":{"foo":42}}

# access the combined REST/WebSocket route via REST
$ curl -X POST --header 'Content-type: application/json' \
  --data '{ "foo": 42 }' http://127.0.0.1:12345/bar
{"at":"bar","type":"rest","seen":{"foo":42}}

# access the exclusive WebSocket route via REST
$ curl -X POST --header 'Content-type: application/json' --data '{ "foo": 42 }' http://127.0.0.1:12345/baz
{"statusCode":400,"error":"Bad Request","message":"HTTP request to a WebSocket-only route not allowed"}

# access the combined REST/WebSocket route via WebSocket
$ wscat --connect ws://127.0.0.1:12345/bar
> { "foo": 42 }
< {"at":"bar","type":"websocket","seen":{"foo":42}}
> { "foo": 7 }
< {"at":"bar","type":"websocket","seen":{"foo":7}}

# access the exclusive WebSocket route via WebSocket
$ wscat --connect ws://127.0.0.1:12345/baz
> { "foo": 42 }
< {"at":"baz","seen":{"foo":42}}
> { "foo": 7 }
< {"at":"baz","seen":{"foo":7}}

# access the full-featured exclusive WebSocket route via WebSockets
$ wscat --connect ws://127.0.0.1:12345/quux
< {"cmd":"WELCOME"}
> {"cmd":"PING"}
< {"result":"PONG"}
> {"cmd":"AWAKE-ALL"}
< {"cmd":"AWAKE"}
< {"cmd":"PING"}
< {"cmd":"PING"}
< {"cmd":"PING"}
< {"cmd":"PING"}
```

Notice
------

With [NES](https://github.com/hapijs/nes) there is a popular alternative
HAPI plugin for WebSocket integration. The hapi-plugin-websocket
plugin in contrast is a light-weight solution and was developed
with especially three distinct features in mind: (1) everything
is handled through the regular HAPI route API (i.e. no additional
APIs like `server.subscribe()`), (2) HTTP replies with status code
204 ("No Content") are explicitly taken into account (i.e. no
WebSocket response message is sent at all in this case) and (3) HAPI
routes can be controlled to be plain REST, combined REST+WebSocket
or WebSocket-only routes. If you want a more elaborate solution,
[NES](https://github.com/hapijs/nes) could be your choice.

License
-------

Copyright (c) 2016 Ralf S. Engelschall (http://engelschall.com/)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

