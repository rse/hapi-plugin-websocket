/*
**  hapi-plugin-websocket -- HAPI plugin for seamless WebSocket integration
**  Copyright (c) 2016-2023 Dr. Ralf S. Engelschall <rse@engelschall.com>
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

import { Plugin, Request, ReqRef, ReqRefDefaults } from "@hapi/hapi"
import { Podium }                                  from "@hapi/podium"
import * as ws                                     from "ws"
import * as http                                   from "node:http"

declare namespace HAPIPluginWebSockets {
    interface PluginState {
        mode: "websocket"
        ctx: Record<string, any>
        wss: ws.Server
        ws: ws.WebSocket
        wsf: any
        req: http.IncomingMessage
        peers: ws.WebSocket[]
        initially: boolean
    }

    interface PluginSpecificConfiguration {
        only?: boolean
        subprotocol?: string
        error?: (
            this: PluginState["ctx"],
            pluginState: PluginState,
            error: Error
        ) => void
        connect?: (
            this: PluginState["ctx"],
            pluginState: PluginState
        ) => void
        disconnect?: (
            this: PluginState["ctx"],
            pluginState: PluginState
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
            this: PluginState["ctx"],
            pluginState: PluginState,
            frame: any
        ) => void
        autoping?: number
        initially?: boolean
    }

    interface OptionalRegistrationOptions {
    }
}

declare const HAPIPluginDucky: Plugin<HAPIPluginWebSockets.OptionalRegistrationOptions>

export = HAPIPluginWebSockets

declare module "@hapi/hapi" {
    export interface Request<Refs extends ReqRef = ReqRefDefaults> extends Podium {
        websocket(): HAPIPluginWebSockets.PluginState
    }
    export interface PluginsStates {
        websocket: HAPIPluginWebSockets.PluginState
    }
    export interface PluginSpecificConfiguration {
        websocket?: HAPIPluginWebSockets.PluginSpecificConfiguration
    }
}

