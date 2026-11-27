const SUPABASE_URL = "https://dousxjmfxyrlepsjnmpd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yFgwE7iPDgZbtAI-NY7gVA_YoxE1Bf7";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SESSION_KEY = "hemocloud_sesion_activa";
const LOCAL_ACCOUNTS_KEY = "hemocloud_cuentas_demo";

function mostrarAlerta(id, texto, tipo = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alerta-feedback ${tipo === "ok" ? "alerta-ok" : "alerta-error"}`;
  el.innerHTML = `<i class="bi ${tipo === "ok" ? "bi-check-circle-fill" : "bi-exclamation-triangle-fill"}"></i> <span>${texto}</span>`;
  el.style.display = "flex";
}

function leerCuentasLocales() {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function guardarCuentaLocal({ nombre, rol, correo, clave, authUserId = null }) {
  const cuentas = leerCuentasLocales().filter(
    (c) => String(c.correo || "").toLowerCase() !== correo.toLowerCase()
  );
  cuentas.push({
    nombre,
    rol,
    correo: correo.toLowerCase(),
    clave,
    authUserId
  });
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(cuentas));
}

async function sincronizarPerfilYEntrar({ nombre, correo, rol }) {
  const { data: perfil } = await db
    .from("personal_acceso")
    .upsert([{
      nombre_completo: nombre,
      correo: correo.toLowerCase(),
      rol,
      ultimo_acceso: new Date().toISOString()
    }], { onConflict: "correo" })
    .select()
    .single();

  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      nombre: perfil?.nombre_completo || nombre,
      correo: correo.toLowerCase(),
      rol: perfil?.rol || rol
    })
  );

  window.location.href = "index.html";
}

// ==================== REGISTRO (registro.html) ====================
const formRegistro = document.getElementById("formRegistro");
if (formRegistro) {
  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre = document.getElementById("regNombre").value.trim();
    const rol = document.getElementById("regRol").value;
    const correo = document.getElementById("regCorreo").value.trim().toLowerCase();
    const clave = document.getElementById("regClave").value;

    if (nombre.length < 3) {
      mostrarAlerta("msgRegistro", "Ingresa un nombre válido de al menos 3 caracteres.");
      return;
    }

    if (clave.length < 6) {
      mostrarAlerta("msgRegistro", "La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    let authUserId = null;
    const { data: authData, error: authError } = await db.auth.signUp({
      email: correo,
      password: clave,
      options: {
        data: {
          nombre_completo: nombre,
          rol
        }
      }
    });

    const msgAuth = (authError?.message || "").toLowerCase();
    const esRateLimit = msgAuth.includes("rate limit");
    const yaRegistrado = msgAuth.includes("already registered");

    if (authError && !esRateLimit && !yaRegistrado) {
      mostrarAlerta("msgRegistro", "No se pudo registrar en Auth: " + authError.message);
      return;
    }

    if (authData && authData.user) {
      authUserId = authData.user.id;
    }

    const { error: tablaError } = await db
      .from("personal_acceso")
      .upsert([{
        nombre_completo: nombre,
        correo,
        rol,
        ultimo_acceso: new Date().toISOString()
      }], { onConflict: "correo" });

    if (tablaError) {
      mostrarAlerta("msgRegistro", "Error al guardar perfil en base de datos: " + tablaError.message);
      return;
    }

    guardarCuentaLocal({ nombre, rol, correo, clave, authUserId });

    const nota = esRateLimit
      ? " (se alcanzó el límite temporal de correos de Auth, pero tu acceso quedó guardado)"
      : "";

    mostrarAlerta(
      "msgRegistro",
      `Cuenta registrada correctamente${nota}. Redirigiendo a Iniciar Sesión...`,
      "ok"
    );

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1100);
  });
}

// ==================== INICIO DE SESIÓN (login.html) ====================
const formLogin = document.getElementById("formLogin");
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();

    const correo = document.getElementById("loginCorreo").value.trim().toLowerCase();
    const clave = document.getElementById("loginClave").value;

    let nombreUsuario = correo.split("@")[0] || "Operador";
    let rolUsuario = "Coordinador de Banco de Sangre";
    let autenticado = false;

    const { data: signData, error: signError } = await db.auth.signInWithPassword({
      email: correo,
      password: clave
    });

    if (!signError && signData && signData.user) {
      autenticado = true;
      nombreUsuario = signData.user.user_metadata?.nombre_completo || nombreUsuario;
      rolUsuario = signData.user.user_metadata?.rol || rolUsuario;
    } else {
      const cuentasLocales = leerCuentasLocales();
      const encontrada = cuentasLocales.find(
        (c) => String(c.correo || "").toLowerCase() === correo && c.clave === clave
      );

      if (encontrada) {
        autenticado = true;
        nombreUsuario = encontrada.nombre || nombreUsuario;
        rolUsuario = encontrada.rol || rolUsuario;
      }
    }

    if (!autenticado) {
      const detalleError = signError?.message ? ` (${signError.message})` : "";
      mostrarAlerta(
        "msgLogin",
        `No se pudo iniciar sesión${detalleError}. Verifica tu correo y contraseña o revisa si en Supabase Auth está activa la confirmación de correo.`
      );
      return;
    }

    await sincronizarPerfilYEntrar({
      nombre: nombreUsuario,
      correo,
      rol: rolUsuario
    });
  });
}
