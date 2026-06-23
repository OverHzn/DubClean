const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  openSrt: () => ipcRenderer.invoke('dialog:openSrt'),
  openAudio: () => ipcRenderer.invoke('dialog:openAudio'),
  chooseOutputFolder: () => ipcRenderer.invoke('dialog:chooseOutputFolder'),
  savePreset: (data) => ipcRenderer.invoke('dialog:savePreset', data),
  loadPreset: () => ipcRenderer.invoke('dialog:loadPreset'),
  parseSrt: (content) => ipcRenderer.invoke('srt:parse', content),
  getVideoMeta: (path) => ipcRenderer.invoke('video:getMeta', path),
  startRender: (payload) => ipcRenderer.invoke('render:start', payload),
  onRenderProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('render:progress', handler);
    return () => ipcRenderer.removeListener('render:progress', handler);
  },
});