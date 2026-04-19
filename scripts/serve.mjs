import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = Number(process.env.PORT || 8787);

const MIME = {
	".json": "application/json",
	".html": "text/html",
	".txt": "text/plain",
};

const server = createServer(async (req, res) => {
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.writeHead(405).end();
		return;
	}

	const urlPath = new URL(req.url, "http://localhost").pathname;
	const filePath = path.join(DIST_DIR, ...urlPath.split("/").filter(Boolean));

	// Prevent path traversal outside dist/
	if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
		res.writeHead(403).end();
		return;
	}

	try {
		const info = await stat(filePath);
		if (!info.isFile()) {
			res.writeHead(404).end();
			return;
		}

		const ext = path.extname(filePath).toLowerCase();
		const contentType = MIME[ext] ?? "application/octet-stream";
		const body = req.method === "HEAD" ? null : await readFile(filePath);

		res.writeHead(200, {
			"Content-Type": contentType,
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "no-store",
		});

		if (body) res.end(body);
		else res.end();
	} catch {
		res.writeHead(404).end();
	}
});

server.on("error", (err) => {
	if (err.code === "EADDRINUSE") {
		console.error(`Port ${PORT} is already in use. Stop the existing server or set PORT=<number> to use a different port.`);
		process.exit(1);
	}

	throw err;
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`wiki-data dev server running at http://127.0.0.1:${PORT}`);
});
