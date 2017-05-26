/*
**  hapi-plugin-websocket -- HAPI plugin for seamless WebSocket integration
**  Copyright (c) 2016-2017 Ralf S. Engelschall <rse@engelschall.com>
**
**  Permission is hereby granted, free of charge, to any person obtaining
**  a copy of this software and associated documentation files (the
**  "Software"), to deal in the Software without restriction, including
**  without limitation the rights to use, copy, modify, merge, publish,
**  distribute, sublicense, and/or sell copies of the Software, and to
**  permit persons to whom the Software is furnished to do so, subject to
**  the following conditions:
**
**  The above copyright notice and this permission notice shall be included
**  in all copies or substantial portions of the Software.
**
**  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
**  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
**  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
**  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
**  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
**  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
**  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*  external dependencies  */
const URI     = require("urijs")
const hoek    = require("hoek")
const Boom    = require("boom")
const WS      = require("ws")

/*  internal dependencies  */
const Package = require("./package.json")

/*  the HAPI plugin registration function  */
const register = (server, pluginOptions, next) => {
    /*  determine plugin registration options  */
    pluginOptions = hoek.applyToDefaults({
        create: function () {}
    }, pluginOptions, true)

    /*  check whether a HAPI route has WebSocket enabled  */
    const hasWebSocketEnabled = (route) => {
        return (
               typeof route === "object"
            && typeof route.settings === "object"
            && typeof route.settings.plugins === "object"
            && typeof route.settings.plugins.websocket !== "undefined"
        )
    }

    /*  determine the route-specific options of WebSocket-enabled route  */
    const fetchRouteOptions = (route) => {
        let routeOptions = route.settings.plugins.websocket
        if (typeof routeOptions !== "object")
            routeOptions = {}
        routeOptions = hoek.applyToDefaults({
            only:        false,
            subprotocol: null,
            connect:     function () {},
            disconnect:  function () {},
            autoping:    0,
            initially:   false
        }, routeOptions, true)
        return routeOptions
    }

    /*  find a particular route for an HTTP request  */
    const findRoute = (req) => {
        let route  = null

        /*  determine request parameters  */
        let url    = URI.parse(req.url)
        let host   = typeof req.headers.host === "string" ? req.headers.host : undefined
        let path   = url.path
        let protos = (req.headers["sec-websocket-protocol"] || "").split(/, */)

        /*  iterate over all HAPI connections...  */
        server.connections.forEach((connection) => {
            if (route !== null)
                return

            /*  ...and find a matching route on each connection  */
            let matched = connection.match("POST", path, host)
            if (matched) {
                /*  we accept only WebSocket-enabled ones  */
                if (!hasWebSocketEnabled(matched))
                    return

                /*  optionally, we accept only the correct WebSocket subprotocol  */
                let routeOptions = fetchRouteOptions(matched)
                if (   routeOptions.subprotocol !== null
                    && protos.indexOf(routeOptions.subprotocol) === -1)
                    return

                /*  take this route  */
                route = matched
            }
        })

        return route
    }

    /*  perform WebSocket handling on HAPI start  */
    server.ext({ type: "onPostStart", method: (server, next) => {

        /*  sanity check all HAPI route definitions  */
        server.connections.forEach((connection) => {
            connection.table().forEach((route) => {
                /*  for all WebSocket-enabled routes...  */
                if (hasWebSocketEnabled(route)) {
                    /*  make sure it is defined for POST method  */
                    if (route.method.toUpperCase() !== "POST")
                        throw new Error("WebSocket protocol can be enabled on POST routes only")
                }
            })
        })

        /*  establish a WebSocket server and attach it to the
            Node HTTP server underlying the HAPI server  */
        let wss = new WS.Server({
            /*  the underyling HTTP server  */
            server: server.listener,

            /*  disable per-server client tracking, as we have to perform it per-route  */
            clientTracking: false,

            /*  ensure that incoming WebSocket requests have a corresponding HAPI route  */
            verifyClient: ({ req }, result) => {
                let route = findRoute(req)
                if (route)
                    result(true)
                else
                    result(false, 404, "No suitable WebSocket-enabled HAPI route found")
            }
        })
        pluginOptions.create(wss)

        /*  per-route peer (aka client) tracking  */
        let routePeers = {}

        /*  per-route timers  */
        let routeTimers = {}

        /*  on WebSocket connection (actually HTTP upgrade events)...  */
        wss.on("connection", (ws, req) => {
            /*  find the (previously already successfully matched) HAPI route  */
            let route = findRoute(req)

            /*  fetch the per-route options  */
            let routeOptions = fetchRouteOptions(route)

            /*  determine a route-specific identifier  */
            let routeId = `${route.method}:${route.path}`
            if (route.vhost)
                routeId += `:${route.vhost}`
            if (routeOptions.subprotocol !== null)
                routeId += `:{routeOptions.subprotocol}`

            /*  track the peer per-route  */
            if (routePeers[routeId] === undefined)
                routePeers[routeId] = []
            let peers = routePeers[routeId]
            peers.push(ws)

            /*  optionally enable automatic WebSocket PING messages  */
            if (routeOptions.autoping > 0) {
                /*  lazy setup of route-specific interval timer  */
                if (routeTimers[routeId] === undefined) {
                    routeTimers[routeId] = setInterval(() => {
                        peers.forEach((ws) => {
                            if (ws.isAlive === false)
                                ws.terminate()
                            else {
                                ws.isAlive = false
                                ws.ping("", false, true)
                            }
                        })
                    }, routeOptions.autoping)
                }

                /*  mark peer alive initially and on WebSocket PONG messages  */
                ws.isAlive = true
                ws.on("pong", () => {
                    ws.isAlive = true
                })
            }

            /*  provide a local context  */
            let ctx = {}

            /*  allow application to hook into WebSocket connection  */
            routeOptions.connect.call(ctx, { ctx, wss, ws, req, peers })

            /*  determine HTTP headers for simulated HTTP request:
                take headers of initial HTTP upgrade request, but explicitly remove Accept-Encoding,
                because it could lead HAPI to compress the payload (which we cannot post-process)  */
            let headers = Object.assign({}, req.headers)
            delete headers["accept-encoding"]

            /*  optionally inject an empty initial message  */
            if (routeOptions.initially) {
                /*  inject incoming WebSocket message as a simulated HTTP request  */
                server.inject({
                    /*  simulate the hard-coded POST request  */
                    method:        "POST",

                    /*  pass-through initial HTTP request information  */
                    url:           req.url,
                    headers:       headers,
                    remoteAddress: req.socket.remoteAddress,

                    /*  provide an empty HTTP POST payload  */
                    payload:       null,

                    /*  provide WebSocket plugin context information  */
                    plugins: {
                        websocket: { mode: "websocket", ctx, wss, ws, req, peers, initially: true }
                    }
                }, (response) => {
                    /*  any HTTP redirection, client error or server error response
                        leads to an immediate WebSocket connection drop  */
                    if (response.statusCode >= 300) {
                        let annotation = `(HAPI handler reponded with HTTP status ${response.statusCode})`
                        if (response.statusCode < 400)
                            ws.close(1002, `Protocol Error ${annotation}`)
                        else if (response.statusCode < 500)
                            ws.close(1008, `Policy Violation ${annotation}`)
                        else
                            ws.close(1011, `Server Error ${annotation}`)
                    }
                })
            }

            /*  hook into WebSocket message retrival  */
            ws.on("message", (message) => {
                /*  inject incoming WebSocket message as a simulated HTTP request  */
                server.inject({
                    /*  simulate the hard-coded POST request  */
                    method:        "POST",

                    /*  pass-through initial HTTP request information  */
                    url:           req.url,
                    headers:       headers,
                    remoteAddress: req.socket.remoteAddress,

                    /*  provide WebSocket message as HTTP POST payload  */
                    payload:       message,

                    /*  provide WebSocket plugin context information  */
                    plugins: {
                        websocket: { mode: "websocket", ctx, wss, ws, req, peers }
                    }
                }, (response) => {
                    /*  transform simulated HTTP response into an outgoing WebSocket message  */
                    if (response.statusCode !== 204 && ws.readyState === WS.OPEN)
                        ws.send(response.payload)
                })
            })

            /*  hook into WebSocket disconnection  */
            ws.on("close", () => {
                /*  allow application to hook into WebSocket disconnection  */
                routeOptions.disconnect.call(ctx, { ctx, wss, ws, req, peers })

                /*  stop tracking the peer  */
                let idx = routePeers[routeId].indexOf(ws)
                routePeers[routeId].splice(idx, 1)
            })
        })

        /*  continue processing  */
        next()
    }})

    /*  make available to HAPI request the remote WebSocket information  */
    server.ext({ type: "onRequest", method: (request, reply) => {
        if (typeof request.plugins.websocket === "object") {
            request.info.remoteAddress = request.plugins.websocket.req.socket.remoteAddress
            request.info.remotePort    = request.plugins.websocket.req.socket.remotePort
        }
        return reply.continue()
    }})

    /*  allow WebSocket information to be easily retrieved  */
    server.decorate("request", "websocket", (request) => {
        return () => {
            return (
                typeof request.plugins.websocket === "object" ?
                request.plugins.websocket :
                { mode: "http", ctx: null, wss: null, ws: null, req: null, peers: null }
            )
        }
    }, { apply: true })

    /*  handle WebSocket exclusive routes  */
    server.ext({ type: "onPreAuth", method: (request, reply) => {
        /*  if WebSocket is enabled with "only" flag on the selected route...  */
        if (   typeof request.route.settings.plugins.websocket === "object"
            && request.route.settings.plugins.websocket.only === true      ) {
            /*  ...but this is not a WebSocket originated request  */
            if (!(   typeof request.plugins.websocket === "object"
                  && request.plugins.websocket.mode === "websocket")) {
                return reply(Boom.badRequest("Plain HTTP request to a WebSocket-only route not allowed"))
            }
        }
        return reply.continue()
    }})

    /*  continue plugin processing  */
    next()
}

/*  provide meta-information as expected by HAPI  */
register.attributes = { pkg: Package }

/*  export register function, wrapped in a plugin object  */
module.exports = { register: register }

