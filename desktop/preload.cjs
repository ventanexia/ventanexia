const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('vnx',{
  systemStatus:()=>ipcRenderer.invoke('system:status'),
  getState:()=>ipcRenderer.invoke('state:get'),
  activateLicense:(payload)=>ipcRenderer.invoke('license:activate',payload),
  refreshLicense:()=>ipcRenderer.invoke('license:status'),
  chooseFolder:()=>ipcRenderer.invoke('folder:choose'),
  revokeFolder:(folder)=>ipcRenderer.invoke('folder:revoke',folder),
  listFolder:(folder)=>ipcRenderer.invoke('folder:list',folder),
  createTestFile:(folder)=>ipcRenderer.invoke('folder:create-test',folder),
  scanCommonData:()=>ipcRenderer.invoke('discovery:scan-common'),
  chooseAndScanData:()=>ipcRenderer.invoke('discovery:choose-scan'),
  authorizeDiscoveredFolder:(folder)=>ipcRenderer.invoke('discovery:authorize',folder),
  openQuickAssist:()=>ipcRenderer.invoke('support:quick-assist'),
  stopSupport:()=>ipcRenderer.invoke('support:stop'),
  sendChat:(messages)=>ipcRenderer.invoke('chat:send',messages),
  pairDemo:()=>ipcRenderer.invoke('device:pair-demo')
});
