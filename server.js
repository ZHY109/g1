const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const filePath = path.join(root, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}).listen(4173, () => {
  console.log("Battle Royale running at http://localhost:4173");
});
