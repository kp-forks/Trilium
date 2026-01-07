import "bootstrap/dist/css/bootstrap.min.css";

// @ts-ignore - module = undefined
// Required for correct loading of scripts in Electron
if (typeof module === 'object') {window.module = module; module = undefined;}

document.body.style.display = "block";
