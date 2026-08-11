import path from "path"

import { app } from "electron"

import { isDev } from "./index.js"

export function getPreloadPath() {
    return path.join(
        app.getAppPath(),
        isDev() ? './' : '../',
        '/dist-electron/preload.cjs'
    )
}

export function getUIPath() {
    return path.join(app.getAppPath(), '/dist-react/index.html');
}

export function getIconPath() {
    return path.join(
        app.getAppPath(),
        isDev() ? './' : '../',
        '/templateIcon.png'
    )
}