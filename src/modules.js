// Módulos del panel. Cada uno se ve solo con su permiso de lectura en la sucursal elegida (un permiso null
// basta con tener acceso al panel); el menú, el inicio y el router salen de esta lista.
//
// El menú lateral sigue el Figma "Restia web", 02 · Panel: los módulos con `nav: 'main'` en este orden, y
// los de `nav: 'config'` dentro de Configuración.

export const MODULES = [
  { key: 'ventas', title: 'Ventas', permission: 'checks.read', nav: 'main',
    description: 'Cuentas del día: mesa, total y si ya se pagaron.' },
  { key: 'comandas', title: 'Comandas', permission: 'orders.read', nav: 'main',
    description: 'Comandas en curso y en qué paso va cada una.' },
  { key: 'menu', title: 'Menú', permission: 'menu.read', nav: 'main',
    description: 'Productos, modificadores, estaciones y disponibilidad.' },
  { key: 'inventario', title: 'Inventario', permission: 'inventory.read', nav: 'main',
    description: 'Insumos, recetas, entradas de mercancía y conteos.' },
  { key: 'personal', title: 'Personal', permission: 'members.read', nav: 'main',
    description: 'Empleados, roles, bajas y enlaces de contraseña.' },
  { key: 'mesas', title: 'Salón', permission: 'tables.read', nav: 'main',
    description: 'Mesas por zona, mantenimiento y su código QR.' },
  { key: 'reportes', title: 'Reportes', permission: 'reports.read', nav: 'main',
    description: 'Ventas por día, métodos de pago y ocupación por hora.' },
  { key: 'reservaciones', title: 'Reservaciones', permission: 'reservations.read', nav: 'main',
    description: 'Política de reservaciones y agenda.' },
  { key: 'clientes', title: 'Clientes', permission: 'customers.read', nav: 'main',
    description: 'Clientes registrados y su historial.' },
  { key: 'caja', title: 'Caja y cobros', permission: 'cash.read', nav: 'main',
    description: 'Cajas, turnos, movimientos y cortes.' },
  { key: 'facturacion', title: 'Facturación', permission: 'invoices.read', nav: 'main',
    description: 'Emisores, CSD, facturas, cancelación y factura global.' },
  { key: 'configuracion', title: 'Configuración', permission: null, nav: 'main',
    description: 'Sucursal, dispositivos, impresión, avisos y auditoría.' },

  { key: 'sucursal', title: 'Sucursal', permission: 'branches.update', nav: 'config',
    description: 'Nombre, dirección y horario de reservas.' },
  { key: 'dispositivos', title: 'Dispositivos', permission: 'devices.read', nav: 'config',
    description: 'Teléfonos dados de alta, bloqueo y retiro.' },
  { key: 'impresion', title: 'Impresión', permission: 'printing.read', nav: 'config',
    description: 'Impresoras, agentes, rutas y trabajos.' },
  { key: 'avisos', title: 'Avisos', permission: null, nav: 'config',
    description: 'Tus avisos: stock bajo, cuentas solicitadas y pagos.' },
  { key: 'auditoria', title: 'Auditoría', permission: 'audit.read', nav: 'config',
    description: 'Bitácora de cambios de la sucursal.' },
]

// El panel es para administración y gerencia. Meseros y cocina tienen permisos de lectura de menú, mesas,
// clientes o facturación porque la app los necesita, pero su trabajo se hace en la app Android.
// Esto solo decide qué se muestra: la API sigue aplicando los permisos en cada petición.
export const PANEL_ROLES = ['ADMIN', 'MANAGER']

export const ROLE_NAMES = { ADMIN: 'Administrador', MANAGER: 'Gerente', WAITER: 'Mesero', KITCHEN: 'Cocina' }

export function moduleByKey(key) {
  return MODULES.find((m) => m.key === key) ?? null
}

/** Módulos de un menú ('main' o 'config') que puede abrir quien cumple `canOpen`. */
export function modulesIn(nav, canOpen) {
  return MODULES.filter((m) => m.nav === nav && canOpen(m.permission))
}
