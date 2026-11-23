// Módulos del panel. Cada uno se ve solo con su permiso de lectura en la sucursal elegida; el menú, el inicio
// y el router salen de esta lista. `phase` es la fase del plan de seguimiento en que se construye.

export const MODULES = [
  { key: 'sucursal', title: 'Sucursal', permission: 'branches.update', group: 'Configuración', phase: '5',
    description: 'Nombre, dirección y horario de reservas.' },
  { key: 'personal', title: 'Personal', permission: 'members.read', group: 'Configuración', phase: '2.2',
    description: 'Empleados, roles, bajas y enlaces de contraseña.' },
  { key: 'menu', title: 'Menú', permission: 'menu.read', group: 'Configuración', phase: '2.3',
    description: 'Productos, modificadores, estaciones y disponibilidad.' },
  { key: 'mesas', title: 'Mesas y QR', permission: 'tables.read', group: 'Configuración', phase: '2.4',
    description: 'Mesas por zona, mantenimiento y su código QR.' },
  { key: 'impresion', title: 'Impresión', permission: 'printing.read', group: 'Configuración', phase: '2.5',
    description: 'Impresoras, agentes, rutas y trabajos.' },
  { key: 'reportes', title: 'Reportes', permission: 'reports.read', group: 'Supervisión', phase: '3',
    description: 'Ventas por día, métodos de pago y ocupación por hora.' },
  { key: 'caja', title: 'Caja', permission: 'cash.read', group: 'Supervisión', phase: '3',
    description: 'Cajas, turnos, movimientos y cortes.' },
  { key: 'clientes', title: 'Clientes', permission: 'customers.read', group: 'Supervisión', phase: '3',
    description: 'Clientes registrados y su historial.' },
  { key: 'reservaciones', title: 'Reservaciones', permission: 'reservations.read', group: 'Supervisión', phase: '3',
    description: 'Política de reservaciones y agenda.' },
  { key: 'dispositivos', title: 'Dispositivos', permission: 'devices.read', group: 'Supervisión', phase: '3',
    description: 'Teléfonos dados de alta, bloqueo y retiro.' },
  { key: 'auditoria', title: 'Auditoría', permission: 'audit.read', group: 'Supervisión', phase: '3',
    description: 'Bitácora de cambios de la sucursal.' },
  { key: 'facturacion', title: 'Facturación', permission: 'invoices.read', group: 'Administración', phase: '4',
    description: 'Emisores, CSD, facturas, cancelación y factura global.' },
  { key: 'inventario', title: 'Inventario', permission: 'inventory.read', group: 'Administración', phase: '4',
    description: 'Insumos, recetas, entradas de mercancía y conteos.' },
]

export const GROUPS = ['Configuración', 'Supervisión', 'Administración']

// El panel es para administración y gerencia. Meseros y cocina tienen permisos de lectura de menú, mesas,
// clientes o facturación porque la app los necesita, pero su trabajo se hace en la app Android.
// Esto solo decide qué se muestra: la API sigue aplicando los permisos en cada petición.
export const PANEL_ROLES = ['ADMIN', 'MANAGER']

export const ROLE_NAMES ={ ADMIN: 'Administrador', MANAGER: 'Gerente', WAITER: 'Mesero', KITCHEN: 'Cocina' }

export function moduleByKey(key) {
  return MODULES.find((m) => m.key === key) ?? null
}
