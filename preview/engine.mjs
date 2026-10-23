import { PGlite } from "./vendor/index.js";
const quote = (s) => {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(s))
    throw Error("Identificador no permitido");
  return '"' + s + '"';
};
export async function createSandbox(schemaSQL, seedSQL) {
  const pg = new PGlite({
    parsers: {
      1082: (value) => value,
      1184: (value) => new Date(value).toISOString(),
      1114: (value) => value,
    },
  });
  await pg.exec(schemaSQL);
  await pg.exec(seedSQL);
  let user = null;
  const ids = {
    admin: "10000000-0000-4000-8000-000000000001",
    cashier: "10000000-0000-4000-8000-000000000002",
    staff: "10000000-0000-4000-8000-000000000003",
    other: "10000000-0000-4000-8000-000000000004",
  };
  async function request(sql, params = []) {
    const id = user?.id || "";
    return pg.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id,
      ]);
      await tx.exec("set local role " + (id ? "authenticated" : "anon"));
      return tx.query(sql, params);
    });
  }
  function builder(table) {
    quote(table);
    let operation = "read",
      cols = "*",
      values,
      filters = [],
      ordering = [],
      offset = 0,
      limit = null,
      one = false,
      optional = false,
      returning = false,
      conflict = null;
    const q = {
      select(c = "*") {
        cols = c;
        returning = true;
        return q;
      },
      eq(k, v) {
        filters.push([k, "=", v]);
        return q;
      },
      neq(k, v) {
        filters.push([k, "<>", v]);
        return q;
      },
      gte(k, v) {
        filters.push([k, ">=", v]);
        return q;
      },
      lte(k, v) {
        filters.push([k, "<=", v]);
        return q;
      },
      gt(k, v) {
        filters.push([k, ">", v]);
        return q;
      },
      lt(k, v) {
        filters.push([k, "<", v]);
        return q;
      },
      in(k, v) {
        filters.push([k, "in", v]);
        return q;
      },
      is(k, v) {
        filters.push([k, "is", v]);
        return q;
      },
      order(k, opts = {}) {
        ordering.push(quote(k) + (opts.ascending === false ? " desc" : " asc"));
        return q;
      },
      range(a, b) {
        offset = a;
        limit = b - a + 1;
        return q;
      },
      limit(n) {
        limit = n;
        return q;
      },
      single() {
        one = true;
        return q;
      },
      maybeSingle() {
        one = true;
        optional = true;
        return q;
      },
      insert(v) {
        operation = "insert";
        values = v;
        return q;
      },
      upsert(v, opts = {}) {
        operation = "insert";
        values = v;
        conflict = opts.onConflict || "id";
        return q;
      },
      update(v) {
        operation = "update";
        values = v;
        return q;
      },
      delete() {
        operation = "delete";
        return q;
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };
    async function execute() {
      try {
        const params = [];
        const bind = (v) => {
          params.push(
            typeof v === "object" && v !== null ? JSON.stringify(v) : v,
          );
          return "$" + params.length;
        };
        const fields =
          cols === "*"
            ? "*"
            : cols
                .split(",")
                .map((s) => quote(s.trim()))
                .join(",");
        const relation = "public." + quote(table);
        let sql;
        if (operation === "insert") {
          const list = Array.isArray(values) ? values : [values];
          const keys = [...new Set(list.flatMap(Object.keys))];
          sql = `insert into ${relation} (${keys.map(quote).join(",")}) values ${list.map((row) => "(" + keys.map((k) => (k in row ? bind(row[k]) : "default")).join(",") + ")").join(",")}`;
          if (conflict)
            sql += ` on conflict (${conflict.split(",").map(quote).join(",")}) do update set ${keys
              .filter((k) => k !== "id")
              .map((k) => quote(k) + "=excluded." + quote(k))
              .join(",")}`;
        } else if (operation === "update")
          sql = `update ${relation} set ${Object.keys(values)
            .map((k) => quote(k) + "=" + bind(values[k]))
            .join(",")}`;
        else if (operation === "delete") sql = `delete from ${relation}`;
        else sql = `select ${fields} from ${relation}`;
        if (filters.length) {
          sql +=
            " where " +
            filters
              .map(([k, op, v]) =>
                op === "in"
                  ? v.length
                    ? quote(k) + " in (" + v.map(bind).join(",") + ")"
                    : "false"
                  : op === "is"
                    ? quote(k) +
                      (v === null ? " is null" : v ? " is true" : " is false")
                    : quote(k) + " " + op + " " + bind(v),
              )
              .join(" and ");
        }
        if (operation === "read") {
          if (ordering.length) sql += " order by " + ordering.join(",");
          if (limit !== null) sql += " limit " + bind(limit);
          if (offset) sql += " offset " + bind(offset);
        } else if (returning) sql += " returning " + fields;
        const result = await request(sql, params);
        let data = operation === "read" || returning ? result.rows : null;
        if (one) {
          if (data?.length !== 1 && !(optional && !data?.length))
            throw Error("No se encontró exactamente un registro autorizado.");
          data = data?.[0] || null;
        }
        return { data, error: null };
      } catch (e) {
        return {
          data: null,
          error: { message: e.message, code: e.code || "PREVIEW_ERROR" },
        };
      }
    }
    return q;
  }
  const client = {
    from: builder,
    async rpc(name, args = {}) {
      try {
        const keys = Object.keys(args),
          params = keys.map((k) =>
            typeof args[k] === "object" && args[k] !== null
              ? JSON.stringify(args[k])
              : args[k],
          );
        const sql =
          "select public." +
          quote(name) +
          "(" +
          keys.map((k, i) => quote(k) + "=> $" + (i + 1)).join(",") +
          ") as result";
        const result = await request(sql, params);
        return { data: result.rows[0]?.result ?? null, error: null };
      } catch (e) {
        return {
          data: null,
          error: { message: e.message, code: e.code || "PREVIEW_ERROR" },
        };
      }
    },
    auth: {
      async getSession() {
        return { data: { session: user ? { user } : null }, error: null };
      },
      async signInWithPassword({ email }) {
        const role = email?.split("@")[0];
        if (!ids[role])
          return {
            data: {},
            error: { message: "Usa los botones de acceso de prueba." },
          };
        user = { id: ids[role], email };
        return { data: { user }, error: null };
      },
      async signOut() {
        user = null;
        return { error: null };
      },
    },
  };
  return { client, close: () => pg.close() };
}
