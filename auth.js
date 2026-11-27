const SUPABASE_URL = "https://dousxjmfxyrlepsjnmpd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yFgwE7iPDgZbtAI-NY7gVA_YoxE1Bf7";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SESSION_KEY = "hemocloud_sesion_activa";
const LOCAL_ACCOUNTS_KEY = "hemocloud_cuentas_demo";

const ROLES_VALIDOS = [
  "Administrador de Red",
  "Coordinador de Banco de Sangre",
  "Médico Hemoterapeuta",
  "Técnico de Laboratorio"
];

const REGEX_NOMBRE = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'.-]{3,80}$/;
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_CLAVE_SEGURA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.#_\-])[A-Za-z\d@$!%*?&.#_\-]{8,64}$/;

function mostrarAlerta(id, texto, tipo = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alerta-feedback ${tipo === "ok" ? "alerta-ok" : "alerta-error"}`;
  el.innerHTML = `<i class="bi ${tipo === "ok" ? "bi-check-circle-fill" : "bi-exclamation-triangle-fill"}"></i> <span>${texto}</span>`;
  el.style.display = "flex";
}

function validarNombrePersona(nombre) {
  if (!nombre || nombre.length < 3) {
    return "El nombre completo debe tener al menos 3 caracteres.";
  }
  if (nombre.length > 80) {
    return "El nombre completo no puede superar los 80 caracteres.";
  }
  if (!REGEX_NOMBRE.test(nombre)) {
    return "El nombre solo puede contener letras, espacios y guiones (sin números ni símbolos).";
  }
  return null;
}

function validarCorreo(correo) {
  if (!correo) {
    return "Ingresa un correo electrónico.";
  }
  if (!REGEX_CORREO.test(correo) || correo.length > 120) {
    return "Ingresa un correo electrónico válido (ejemplo: usuario@hospital.com).";
  }
  return null;
}

function validarContrasenaRegistro(clave) {
  if (!clave) {
    return "Ingresa una contraseña.";
  }
  if (/\s/.test(clave)) {
    return "La contraseña no debe contener espacios en blanco.";
  }
  if (clave.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (!/[A-Z]/.test(clave)) {
    return "La contraseña debe incluir al menos una letra mayúscula (A-Z).";
  }
  if (!/[a-z]/.test(clave)) {
    return "La contraseña debe incluir al menos una letra minúscula (a-z).";
  }
  if (!/\d/.test(clave)) {
    return "La contraseña debe incluir al menos un número (0-9).";
  }
  if (!/[@$!%*?&.#_\-]/.test(clave)) {
    return "La contraseña debe incluir al menos un carácter especial (@$!%*?&.#_-).";
  }
  if (!REGEX_CLAVE_SEGURA.test(clave)) {
    return "La contraseña contiene caracteres no permitidos o excede los 64 caracteres.";
  }
  return null;
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
      ultimo_acceso: new Date().toISOString(),
      activo: true
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

    const nombre = document.getElementById("regNombre").value.trim().replace(/\s+/g, " ");
    const rol = document.getElementById("regRol").value;
    const correo = document.getElementById("regCorreo").value.trim().toLowerCase();
    const clave = document.getElementById("regClave").value;
    const inputConfirmar = document.getElementById("regClaveConfirmar");

    const errorNombre = validarNombrePersona(nombre);
    if (errorNombre) {
      mostrarAlerta("msgRegistro", errorNombre);
      return;
    }

    if (!ROLES_VALIDOS.includes(rol)) {
      mostrarAlerta("msgRegistro", "Selecciona un rol clínico válido.");
      return;
    }

    const errorCorreo = validarCorreo(correo);
    if (errorCorreo) {
      mostrarAlerta("msgRegistro", errorCorreo);
      return;
    }

    const errorClave = validarContrasenaRegistro(clave);
    if (errorClave) {
      mostrarAlerta("msgRegistro", errorClave);
      return;
    }

    if (inputConfirmar && inputConfirmar.value !== clave) {
      mostrarAlerta("msgRegistro", "Las contraseñas no coinciden.");
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

    if (yaRegistrado) {
      mostrarAlerta("msgRegistro", "Este correo ya está registrado. Inicia sesión o usa otro correo.");
      return;
    }

    if (authError && !esRateLimit) {
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
        ultimo_acceso: new Date().toISOString(),
        activo: true
      }], { onConflict: "correo" });

    if (tablaError) {
      mostrarAlerta("msgRegistro", "Error al guardar perfil en base de datos: " + tablaError.message);
      return;
    }

    guardarCuentaLocal({ nombre, rol, correo, clave, authUserId });

    const nota = esRateLimit
      ? " (límite temporal de envío de correos de Auth alcanzado; tu acceso quedó habilitado)"
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

    const errorCorreo = validarCorreo(correo);
    if (errorCorreo) {
      mostrarAlerta("msgLogin", errorCorreo);
      return;
    }

    if (!clave || clave.length < 6) {
      mostrarAlerta("msgLogin", "Ingresa tu contraseña (mínimo 6 caracteres).");
      return;
    }

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
      } else if ((signError?.message || "").toLowerCase().includes("email not confirmed")) {
        const { data: perfilExistente } = await db
          .from("personal_acceso")
          .select("*")
          .eq("correo", correo)
          .eq("activo", true)
          .maybeSingle();

        if (perfilExistente) {
          autenticado = true;
          nombreUsuario = perfilExistente.nombre_completo || nombreUsuario;
          rolUsuario = perfilExistente.rol || rolUsuario;
        }
      }
    }

    if (!autenticado) {
      const detalleError = signError?.message ? ` (${signError.message})` : "";
      mostrarAlerta(
        "msgLogin",
        `Correo o contraseña incorrectos${detalleError}. Verifica tus datos o crea una cuenta nueva.`
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
