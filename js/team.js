/* Administración de perfiles existentes, protegida por las políticas de Supabase. */
(() => {
  'use strict';
  const roles = { admin: 'Administración', staff: 'Personal', cashier: 'Caja', kitchen: 'Cocina', bar: 'Barra' };
  let generation = 0;
  let saving = false;
  const el = id => document.getElementById(id);
  function requireAdmin() {
    if (me?.role !== 'admin' || !me.active) throw Error('Solo Administración puede gestionar usuarios.');
  }
  async function profiles() {
    const result = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await db.from('profiles').select('id,full_name,role,active').order('id').range(start, start + 499);
      if (error) throw error;
      result.push(...(data || []));
      if ((data || []).length < 500) return result;
    }
  }
  window.openTeam = async () => {
    try {
      requireAdmin();
      if (saving) return;
      let screen = el('teamScreen');
      if (!screen) {
        screen = document.createElement('section');
        screen.id = 'teamScreen'; screen.className = 'screen';
        document.querySelector('main.app').appendChild(screen);
      }
      screen.innerHTML = '<button class="back" onclick="goAdmin()">← Administración</button><h2>👥 Usuarios y permisos</h2>'
        + '<div class="notice">Gestiona los perfiles ya registrados. Las altas y el restablecimiento de contraseñas se realizan desde la administración de acceso; esta pantalla no envía correos ni cambia contraseñas.</div>'
        + '<button id="teamRefresh" class="dark">Actualizar</button><label for="teamSearch">Buscar por nombre o rol</label><input id="teamSearch" type="search"><div id="teamMessage" role="status" aria-live="polite"></div><div id="teamList"></div>'
        + '<h3>Acceso de cada rol</h3><div class="card"><p><b>Administración:</b> gestión y reportes; cierre definitivo de caja.</p><p><b>Personal:</b> abrir y agregar consumos a sus cuentas.</p><p><b>Caja:</b> cobros, nuevas ventas y movimientos de efectivo.</p><p><b>Cocina / Barra:</b> preparación de artículos de su estación.</p></div>';
      show('teamScreen');
      el('teamRefresh').onclick = window.openTeam;
      const token = ++generation;
      el('teamMessage').textContent = 'Consultando…';
      const rows = (await profiles()).filter(p => Object.hasOwn(roles, p.role));
      requireAdmin();
      if (token !== generation) return;
      const render = () => {
        const search = el('teamSearch').value.trim().toLowerCase();
        const matches = rows.filter(p => ((p.full_name || '') + ' ' + roles[p.role]).toLowerCase().includes(search));
        el('teamList').innerHTML = matches.map((p, i) => {
          const own = p.id === me.id;
          return '<article class="card"><h3>' + esc(p.full_name || 'Sin nombre') + '</h3><div class="muted">' + esc(p.id) + '</div><span class="badge">' + (p.active ? 'Activo' : 'Desactivado') + '</span>'
            + '<label for="teamRole' + i + '">Rol</label><select id="teamRole' + i + '" ' + (own ? 'disabled' : '') + '>'
            + Object.entries(roles).map(([value, label]) => '<option value="' + value + '" ' + (value === p.role ? 'selected' : '') + '>' + label + '</option>').join('') + '</select>'
            + '<label><input id="teamActive' + i + '" type="checkbox" ' + (p.active ? 'checked ' : '') + (own ? 'disabled' : '') + '> Acceso activo</label>'
            + (own ? '<p class="muted">Tu cuenta actual. Cambia su acceso desde otra cuenta administradora.</p>' : '<button class="yellow" data-team-save="' + i + '">Guardar permisos</button>') + '</article>';
        }).join('') || '<div class="empty">No hay perfiles para esta búsqueda.</div>';
        el('teamList').querySelectorAll('[data-team-save]').forEach(button => {
          button.onclick = async () => {
            if (saving) return;
            const i = Number(button.dataset.teamSave), user = matches[i];
            try {
              requireAdmin();
              if (!user || user.id === me.id) throw Error('No puedes modificar tu propio acceso.');
              const role = el('teamRole' + i).value, active = el('teamActive' + i).checked;
              if (!Object.hasOwn(roles, role)) throw Error('Rol inválido.');
              if (role === user.role && active === user.active) { el('teamMessage').textContent = 'No hay cambios pendientes.'; return; }
              saving = true; button.disabled = true;
              if (!await coliseoConfirm('¿Guardar los permisos de ' + (user.full_name || user.id) + '?\nRol: ' + roles[role] + '\nAcceso: ' + (active ? 'Activo' : 'Desactivado'))) return;
              requireAdmin();
              const { data: self, error: selfError } = await db.from('profiles').select('role,active').eq('id', me.id).single();
              if (selfError) throw selfError;
              if (!self?.active || self.role !== 'admin') throw Error('Tu acceso de Administración cambió. Vuelve a iniciar sesión.');
              const { data, error } = await db.from('profiles').update({ role, active }).eq('id', user.id).eq('role', user.role).eq('active', user.active).select('id,role,active');
              if (error) throw error;
              if (data?.length !== 1) throw Error('El perfil cambió o no se confirmó el guardado. Actualiza la lista.');
              user.role = data[0].role; user.active = data[0].active;
              render(); el('teamMessage').textContent = 'Permisos guardados.';
            } catch (error) { el('teamMessage').textContent = error.message || String(error); }
            finally { saving = false; button.disabled = false; }
          };
        });
      };
      el('teamSearch').oninput = () => { if (!saving) render(); };
      render(); el('teamMessage').textContent = '';
    } catch (error) {
      if (el('teamMessage') && me?.role === 'admin') el('teamMessage').textContent = error.message || String(error);
      else coliseoNotice(error.message || String(error));
    }
  };
})();
