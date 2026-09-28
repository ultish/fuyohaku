const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

const corsHeaders = { "access-control-allow-origin": "*" };

function withCors(response) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function isAccessAuthenticated(request) {
  return request.headers.has("cf-access-jwt-assertion") || request.headers.has("cf-access-authenticated-user-email");
}

function isLocalRequest(request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function mediaKeyFromUrl(value) {
  if (!value?.startsWith("/media/")) return null;
  return decodeURIComponent(value.slice("/media/".length));
}

function safeFilename(name) {
  return String(name || "upload").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "upload";
}

async function readProject(request) {
  const body = await request.json();
  const project = {
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    image: String(body.image || "").trim(),
    url: String(body.url || "#projects").trim(),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
  };
  if (!project.title || !project.description || !project.image) {
    throw new Error("title, description, and image are required");
  }
  return project;
}

async function api(request, env) {
  const url = new URL(request.url);
  if (!env.DB) return json({ error: "D1 is not configured yet." }, 503);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders, "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS", "access-control-allow-headers": "cf-access-jwt-assertion, cf-access-authenticated-user-email, content-type" } });
  }

  if (url.pathname === "/api/admin/uploads" && request.method === "POST") {
    if (!isAccessAuthenticated(request) && !isLocalRequest(request)) return withCors(json({ error: "Unauthorized" }, 401));
    if (!env.MEDIA) return withCors(json({ error: "R2 is not configured yet." }, 503));
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/")) return withCors(json({ error: "Please upload an image file." }, 400));
    if (file.size > 8 * 1024 * 1024) return withCors(json({ error: "Images must be 8 MB or smaller." }, 400));
    const key = `images/${crypto.randomUUID()}-${safeFilename(file.name)}`;
    await env.MEDIA.put(key, file, { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
    return withCors(json({ key, url: `/media/${key}` }, 201));
  }

  if (url.pathname === "/api/projects" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, title, description, image, url, sort_order FROM projects ORDER BY sort_order ASC, created_at ASC").all();
    return withCors(json(results));
  }

  if (!url.pathname.startsWith("/api/admin/") || (!isAccessAuthenticated(request) && !isLocalRequest(request))) {
    return withCors(json({ error: "Unauthorized" }, 401));
  }

  try {
    if (url.pathname === "/api/admin/projects" && request.method === "POST") {
      const project = await readProject(request);
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO projects (id, title, description, image, url, sort_order) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, project.title, project.description, project.image, project.url, project.sort_order).run();
      return withCors(json({ id, ...project }, 201));
    }

    const match = url.pathname.match(/^\/api\/admin\/projects\/([^/]+)$/);
    if (!match) return withCors(json({ error: "Not found" }, 404));
    const id = decodeURIComponent(match[1]);

    if (request.method === "DELETE") {
      const existing = await env.DB.prepare("SELECT image FROM projects WHERE id = ?").bind(id).first();
      await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
      const oldKey = mediaKeyFromUrl(existing?.image);
      if (oldKey && env.MEDIA) await env.MEDIA.delete(oldKey);
      return withCors(json({ ok: true }));
    }

    if (request.method === "PATCH") {
      const project = await readProject(request);
      const existing = await env.DB.prepare("SELECT image FROM projects WHERE id = ?").bind(id).first();
      await env.DB.prepare("UPDATE projects SET title = ?, description = ?, image = ?, url = ?, sort_order = ? WHERE id = ?")
        .bind(project.title, project.description, project.image, project.url, project.sort_order, id).run();
      const oldKey = mediaKeyFromUrl(existing?.image);
      if (oldKey && oldKey !== mediaKeyFromUrl(project.image) && env.MEDIA) await env.MEDIA.delete(oldKey);
      return withCors(json({ id, ...project }));
    }
  } catch (error) {
    return withCors(json({ error: error.message }, 400));
  }

  return withCors(json({ error: "Method not allowed" }, 405));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env);
    if (url.pathname.startsWith("/media/") && env.MEDIA) {
      const key = decodeURIComponent(url.pathname.slice("/media/".length));
      const object = await env.MEDIA.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      return new Response(object.body, { headers });
    }
    return env.ASSETS.fetch(request);
  },
};
