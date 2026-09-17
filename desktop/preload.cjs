const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('vnx',{
  systemStatus:()=>ipcRenderer.invoke('system:status'),
  getState:()=>ipcRenderer.invoke('state:get'),
  chooseFolder:()=>ipcRenderer.invoke('folder:choose'),
  revokeFolder:(folder)=>ipcRenderer.invoke('folder:revoke',folder),
  listFolder:(folder)=>ipcRenderer.invoke('folder:list',folder),
  createTestFile:(folder)=>ipcRenderer.invoke('folder:create-test',folder),
  openQuickAssist:()=>ipcRenderer.invoke('support:quick-assist'),
  stopSupport:()=>ipcRenderer.invoke('support:stop'),
  sendChat:(messages)=>ipcRenderer.invoke('chat:send',messages),
  pairDemo:()=>ipcRenderer.invoke('device:pair-demo')
});
