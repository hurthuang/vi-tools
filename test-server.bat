@echo off
cd /d "%~dp0"

set "PAGE=index.html"
set "PORT=8000"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install from https://nodejs.org
    pause
    exit /b
)

set "SCRIPT=const http=require('http'),fs=require('fs'),p=require('path'),u=require('url');const mime={'html':'text/html','htm':'text/html','css':'text/css','js':'text/javascript','json':'application/json','png':'image/png','jpg':'image/jpeg','gif':'image/gif','svg':'image/svg+xml','ico':'image/x-icon'};http.createServer((req,res)=>{let pp=decodeURIComponent(u.parse(req.url).pathname);if(pp==='/')pp='/index.html';const fp=p.join(process.cwd(),pp);if(fs.existsSync(fp)&&fs.statSync(fp).isDirectory()){const files=fs.readdirSync(fp).map(f=>'<li><a href=\"'+pp+(pp.endsWith('/')?'':'/')+f+'\">'+f+'</a></li>').join('');res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end('<html><body><h2>'+pp+'</h2><ul>'+files+'</ul></body></html>');}else if(fs.existsSync(fp)){const ext=p.extname(fp).slice(1).toLowerCase();res.writeHead(200,{'Content-Type':(mime[ext]||'application/octet-stream')+';charset=utf-8'});fs.createReadStream(fp).pipe(res);}else{res.writeHead(404);res.end('404: '+pp);}}).listen(%PORT%,()=>console.log('http://localhost:%PORT%/ (close window to stop)'));"

start "HTTP Server :%PORT% - close to stop" cmd /k node -e "%SCRIPT%"

timeout /t 2 /nobreak >nul
start "" "http://localhost:%PORT%/%PAGE%"
exit