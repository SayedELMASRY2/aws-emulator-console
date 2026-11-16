"use strict";

navGroup("Storage", [{ path: "/s3", label: "S3", keywords: "bucket object storage" }]);

const S3 = {
  async emptyBucket(bucket, prefix = "") {
    let token, n = 0;
    do {
      const r = await API.call("s3", "ListObjectsV2", { Bucket: bucket, Prefix: prefix, ContinuationToken: token });
      const keys = (r.Contents || []).map(o => ({ Key: o.Key }));
      if (keys.length) { await API.call("s3", "DeleteObjects", { Bucket: bucket, Delete: { Objects: keys, Quiet: true } }); n += keys.length; }
      token = r.NextContinuationToken;
    } while (token);
    return n;
  },
  async upload(bucket, key, file) {
    const url = `/api/s3/upload?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
    return API.req("POST", url, file, { "X-File-Type": file.type || "" });
  },
  dl(bucket, key, inline) {
    return `/api/s3/download?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}${inline ? "&inline=1" : ""}`;
  },
};

route("/s3", async () => {
  const page = h("div", pageHeader("S3", "Buckets and objects."));
  const panel = resourcePanel({
    title: "Buckets",
    rowKey: "Name",
    load: async () => (await API.call("s3", "ListBuckets")).Buckets || [],
    columns: [
      { label: "Name", render: b => h("a", { href: `#/s3/b/${encodeURIComponent(b.Name)}` }, b.Name) },
      { label: "Created", render: b => fmtDate(b.CreationDate) },
    ],
    onRowClick: b => go(`/s3/b/${encodeURIComponent(b.Name)}`),
    empty: "No buckets yet. Create one to start.",
    create: {
      label: "Create bucket",
      open: () => formModal({
        title: "Create bucket",
        fields: [
          { name: "name", label: "Bucket name", required: true, placeholder: "my-bucket", help: "3–63 characters: lowercase letters, numbers, dots and hyphens." },
          { name: "versioning", label: "Turn on versioning", type: "checkbox" },
        ],
        onSubmit: async v => {
          await API.call("s3", "CreateBucket", { Bucket: v.name });
          if (v.versioning) await API.call("s3", "PutBucketVersioning", { Bucket: v.name, VersioningConfiguration: { Status: "Enabled" } });
          toast(`Bucket ${v.name} created`);
          panel.refresh();
        },
      }),
    },
    actions: [{
      label: "Empty & delete", kind: "danger", icon: "trash", confirm: "Delete every object in, and then delete,",
      run: async rows => { for (const b of rows) { await S3.emptyBucket(b.Name); await API.call("s3", "DeleteBucket", { Bucket: b.Name }); } },
      done: "Deleted",
    }],
  });
  page.appendChild(panel);
  return page;
});

route("/s3/b/:bucket", async ({ bucket, prefix = "" }) => {
  const parts = prefix.split("/").filter(Boolean);
  const crumbList = [["S3", "#/s3"], [bucket, `#/s3/b/${encodeURIComponent(bucket)}`]];
  parts.forEach((p, i) => crumbList.push([p, `#/s3/b/${encodeURIComponent(bucket)}${q({ prefix: parts.slice(0, i + 1).join("/") + "/" })}`]));
  const page = h("div", crumbs(...crumbList), pageHeader(bucket, prefix ? `Folder: ${prefix}` : "Bucket"));

  const objects = () => {
    const fileInput = h("input", { type: "file", multiple: true, hidden: true });
    let panel;
    const uploadFiles = async files => {
      for (const f of files) {
        try { await S3.upload(bucket, prefix + f.name, f); toast(`Uploaded ${f.name}`); }
        catch (e) { toastErr(e); }
      }
      panel.refresh();
    };
    fileInput.addEventListener("change", () => { uploadFiles([...fileInput.files]); fileInput.value = ""; });
    panel = resourcePanel({
      title: "Objects",
      rowKey: "Key",
      load: async () => {
        const rows = [];
        let token;
        do {
          const r = await API.call("s3", "ListObjectsV2", { Bucket: bucket, Prefix: prefix, Delimiter: "/", ContinuationToken: token });
          (r.CommonPrefixes || []).forEach(p => rows.push({ Key: p.Prefix, folder: true }));
          (r.Contents || []).filter(o => o.Key !== prefix).forEach(o => rows.push(o));
          token = r.NextContinuationToken;
        } while (token);
        return rows;
      },
      columns: [
        { label: "Name", render: o => o.folder
            ? h("a", { href: `#/s3/b/${encodeURIComponent(bucket)}${q({ prefix: o.Key })}` }, "📁 ", o.Key.slice(prefix.length))
            : h("span", "📄 ", o.Key.slice(prefix.length)) },
        { label: "Size", class: "num", render: o => (o.folder ? "" : fmtBytes(o.Size)) },
        { label: "Last modified", render: o => fmtDate(o.LastModified) },
        { label: "", render: o => o.folder ? null : h("span", { class: "row" },
            h("a", { href: S3.dl(bucket, o.Key, true), target: "_blank", rel: "noopener" }, "Open"),
            h("a", { href: S3.dl(bucket, o.Key) }, "Download"),
            h("a", { href: "#", onclick: async e => { e.preventDefault(); try { showJson(o.Key, await API.call("s3", "HeadObject", { Bucket: bucket, Key: o.Key })); } catch (er) { toastErr(er); } } }, "Details")) },
      ],
      empty: "This folder is empty. Upload files or drop them below.",
      actions: [{
        label: "Delete", kind: "danger", icon: "trash", confirm: "Delete",
        run: async rows => {
          for (const o of rows) {
            if (o.folder) await S3.emptyBucket(bucket, o.Key);
            else await API.call("s3", "DeleteObject", { Bucket: bucket, Key: o.Key });
          }
        },
        done: "Deleted",
      }],
      create: {
        label: "Upload",
        open: () => fileInput.click(),
      },
    });
    const folderBtn = button("Create folder", () => formModal({
      title: "Create folder",
      fields: [{ name: "name", label: "Folder name", required: true }],
      onSubmit: async v => {
        await API.call("s3", "PutObject", { Bucket: bucket, Key: prefix + v.name.replace(/\/+$/, "") + "/", Body: "" });
        panel.refresh();
      },
    }), { icon: "folder" });
    panel.querySelector(".toolbar").prepend(folderBtn);
    const textBtn = button("New text file", () => formModal({
      title: "New text file", wide: true,
      fields: [
        { name: "key", label: "File name", required: true, placeholder: "notes.txt" },
        { name: "body", label: "Content", type: "code", rows: 12 },
      ],
      onSubmit: async v => {
        const type = v.key.endsWith(".json") ? "application/json" : v.key.endsWith(".csv") ? "text/csv" : "text/plain";
        await API.call("s3", "PutObject", { Bucket: bucket, Key: prefix + v.key, Body: v.body, ContentType: type });
        panel.refresh();
      },
    }));
    panel.querySelector(".toolbar").prepend(textBtn);
    const drop = h("div", { class: "dropzone" }, "Drop files here to upload them to ", h("code", prefix || "/"));
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); uploadFiles([...e.dataTransfer.files]); });
    panel.append(drop, fileInput);
    return panel;
  };

  const props = () => {
    const box = h("div", { class: "panel" }, h("div", { class: "loading" }, "Loading…"));
    (async () => {
      const [ver, loc, tags] = await Promise.all([
        API.call("s3", "GetBucketVersioning", { Bucket: bucket }).catch(e => ({ _e: e })),
        API.call("s3", "GetBucketLocation", { Bucket: bucket }).catch(e => ({ _e: e })),
        API.call("s3", "GetBucketTagging", { Bucket: bucket }).catch(() => ({ TagSet: [] })),
      ]);
      const status = ver.Status || "Disabled";
      clear(box).append(
        h("div", { class: "panel-head" }, h("h2", "Properties"),
          button(status === "Enabled" ? "Suspend versioning" : "Enable versioning", async () => {
            try { await API.call("s3", "PutBucketVersioning", { Bucket: bucket, VersioningConfiguration: { Status: status === "Enabled" ? "Suspended" : "Enabled" } }); toast("Versioning updated"); renderRoute(); }
            catch (e) { toastErr(e); }
          })),
        kv([
          ["Name", bucket],
          ["ARN", `arn:aws:s3:::${bucket}`],
          ["Region", loc.LocationConstraint || "us-east-1"],
          ["Versioning", badge(status)],
          ["Tags", Object.entries(tagsToObj(tags.TagSet)).map(([k, v]) => `${k}=${v}`).join(", ") || "—"],
          ["S3 URI", `s3://${bucket}/`],
        ]));
    })();
    return box;
  };

  const policy = () => {
    const ta = h("textarea", { class: "input mono", rows: 16, spellcheck: "false" });
    const box = h("div", { class: "panel" },
      h("div", { class: "panel-head" }, h("div", h("h2", "Bucket policy"), h("p", { class: "muted" }, "Stored and returned like AWS, but the emulator doesn't enforce it.")),
        h("div", { class: "toolbar" },
          button("Delete policy", async () => { try { await API.call("s3", "DeleteBucketPolicy", { Bucket: bucket }); ta.value = ""; toast("Policy deleted"); } catch (e) { toastErr(e); } }, { kind: "danger" }),
          button("Save", async () => {
            try { JSON.parse(ta.value); await API.call("s3", "PutBucketPolicy", { Bucket: bucket, Policy: ta.value }); toast("Policy saved"); }
            catch (e) { toastErr(e); }
          }, { kind: "primary" }))),
      h("div", { class: "panel-pad" }, ta));
    API.call("s3", "GetBucketPolicy", { Bucket: bucket })
      .then(r => (ta.value = JSON.stringify(JSON.parse(r.Policy), null, 2)))
      .catch(() => (ta.value = JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: "PublicRead", Effect: "Allow", Principal: "*", Action: "s3:GetObject", Resource: `arn:aws:s3:::${bucket}/*` }] }, null, 2)));
    return box;
  };

  page.appendChild(tabs([{ label: "Objects", render: objects }, { label: "Properties", render: props }, { label: "Policy", render: policy }]));
  return page;
});
