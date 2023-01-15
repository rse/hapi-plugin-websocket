/*
**  hapi-plugin-websocket -- HAPI plugin for seamless WebSocket integration
**  Copyright (c) 2016-2022 Dr. Ralf S. Engelschall <rse@engelschall.com>
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

import * as ws   from "ws"
import * as http from "node:http"

interface HapiWebsocketPluginState<WSF = any> {
    mode: "websocket"
    ctx: Record<string, any>
    wss: ws.Server
    ws: ws.WebSocket
    wsf: WSF
    req: http.IncomingMessage
    peers: ws.WebSocket[]
    initially: boolean
}

interface HapiWebsocketPluginSpecificConfiguration {
    only?: boolean
    subprotocol?: string
    error?: (
        this: HapiWebsocketPluginState["ctx"],
        pluginState: HapiWebsocketPluginState,
        error: Error
    ) => void
    connect?: (
        this: HapiWebsocketPluginState["ctx"],
        pluginState: HapiWebsocketPluginState
    ) => void
    disconnect?: (
        this: HapiWebsocketPluginState["ctx"],
        pluginState: HapiWebsocketPluginState
    ) => void
    request?: (
        ctx: any,
        request: any,
        h?: any
    ) => void
    response?: (
        ctx: any,
        request: any,
        h?: any
    ) => void
    frame?: boolean
    frameEncoding?: "json" | string
    frameRequest?: "REQUEST" | string
    frameResponse?: "RESPONSE" | string
    frameMessage?: (
        this: HapiWebsocketPluginState["ctx"],
        pluginState: HapiWebsocketPluginState,
        frame: any
    ) => void
    autoping?: number
    initially?: boolean
}

declare module "@hapi/hapi" {
    export interface Request<ReqRefDefaults> {
        websocket(): HapiWebsocketPluginState
    }
    export interface PluginsStates {
        websocket: HapiWebsocketPluginState
    }
    export interface PluginSpecificConfiguration {
        websocket: HapiWebsocketPluginSpecificConfiguration
    }
}

