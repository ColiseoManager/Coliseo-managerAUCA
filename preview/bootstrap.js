/* Vista previa aislada. Este archivo se incluye solamente en dist de prueba. */
(() => {
  "use strict";
  const ready = Promise.all([
    import("./engine.mjs"),
    fetch("/preview/schema.sql").then((r) => {
      if (!r.ok) throw Error("No se pudo cargar la estructura de pruebas");
      return r.text();
    }),
    fetch("/preview/seed.sql").then((r) => r.text()),
  ]).then(([m, schema, seed]) => m.createSandbox(schema, seed));
  // La aplicación conserva el contrato supabase-js, pero aquí cada consulta se
  // ejecuta en PostgreSQL local. No se instancia ningún cliente Supabase remoto.
  function chain(method, args) {
    const calls = [[method, args]];
    const proxy = new Proxy(
      {},
      {
        get(_, key) {
          if (key === "then")
            return (ok, bad) =>
              ready
                .then(({ client }) => {
                  let q = client;
                  for (const [m, a] of calls) q = q[m](...a);
                  return q;
                })
                .then(ok, bad);
          return (...a) => {
            calls.push([key, a]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  }
  const client = {
    from: (...a) => chain("from", a),
    rpc: (...a) => ready.then((x) => x.client.rpc(...a)),
    auth: new Proxy(
      {},
      {
        get:
          (_, method) =>
          (...args) =>
            ready.then((x) => x.client.auth[method](...args)),
      },
    ),
  };
  window.supabase = { createClient: () => client };
  document.addEventListener("DOMContentLoaded", () => {
    const banner = document.createElement("aside");
    banner.id = "preview-banner";
    banner.innerHTML =
      '<b>VERSIÓN DE PRUEBA · DATOS FICTICIOS</b><span>Sin conexión a la base real. Los cambios se reinician al recargar.</span><div><button data-role="admin">Administrador</button><button data-role="cashier">Caja</button><button data-role="staff">Personal</button></div><p id="preview-state" role="status">Preparando la prueba segura…</p>';
    document.body.prepend(banner);
    const loginbox = document.querySelector(".loginbox");
    if (loginbox) loginbox.hidden = true;
    banner.querySelectorAll("button").forEach((btn) => {
      btn.disabled = true;
      btn.onclick = async () => {
        banner.querySelectorAll("button").forEach((b) => (b.disabled = true));
        try {
          await client.auth.signOut();
          const result = await client.auth.signInWithPassword({
            email: btn.dataset.role + "@prueba.invalid",
          });
          if (result.error) throw result.error;
          await route(result.data.user);
          document.getElementById("preview-state").textContent =
            "Rol actual: " + btn.textContent;
        } catch (e) {
          document.getElementById("preview-state").textContent =
            "Error: " + e.message;
        } finally {
          banner
            .querySelectorAll("button")
            .forEach((b) => (b.disabled = false));
        }
      };
    });
    ready
      .then(() => {
        document.getElementById("preview-state").textContent =
          "Lista. Elige un rol para comenzar.";
        banner.querySelectorAll("button").forEach((b) => (b.disabled = false));
      })
      .catch((e) => {
        document.getElementById("preview-state").textContent =
          "No se pudo iniciar la prueba: " + e.message;
      });
  });
})();
