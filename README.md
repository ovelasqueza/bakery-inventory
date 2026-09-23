#  Inventario Panadería

Sistema de gestión de inventario para panadería desarrollado con Next.js 14, Tailwind CSS y Supabase.

## Características

- **Gestión de Productos (CRUD completo)**
  - Crear, editar y eliminar productos
  - Asignar categorías opcionales
  - Historial de precios con trazabilidad
  - Búsqueda en tiempo real

- **Inventario por Fechas**
  - Fecha por defecto: día 5 de cada mes
  - Carga automática de todos los productos
  - Cálculo en tiempo real de subtotales y total general
  - Estados: en proceso, completado, cancelado
  - Agrupación por categorías

- **Diseño Mobile-First**
  - Interfaz optimizada para celulares y tablets
  - Navegación inferior fija en móvil
  - Componentes táctiles amigables
  - Soporte PWA (instalar como app)

##  Instalación

### 1. Clonar e instalar dependencias

```bash
cd bakery-inventory
npm install
```

### 2. Configurar Supabase

1. Ve a tu proyecto en [Supabase](https://app.supabase.com)
2. Ejecuta el script SQL en el SQL Editor:
   - Abre `supabase/schema.sql`
   - Copia y pega todo el contenido
   - Ejecuta el script

3. Copia el archivo de ejemplo de variables de entorno:

```bash
cp .env.local.example .env.local
```

4. Edita `.env.local` con tus credenciales de Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://iuihlmlwotkltuabxgi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
```

> Encuentra tu `anon key` en: Project Settings → API → Project API keys

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 📱 Uso desde el celular

1. Abre la URL de la aplicación en el navegador de tu celular
2. En Chrome/Safari, selecciona "Agregar a pantalla de inicio"
3. La app se instalará como una aplicación nativa

##  Estructura de la Base de Datos

### Tablas principales

| Tabla | Descripción |
|-------|-------------|
| `categorias` | Categorías de productos (opcional) |
| `productos` | Catálogo de productos con precio actual |
| `historial_precios` | Registro de cambios de precio |
| `inventarios` | Cabecera de cada conteo de inventario |
| `inventario_detalles` | Detalle de productos por inventario |

### Características de la BD

- **Triggers automáticos**: El historial de precios se registra automáticamente al modificar un producto
- **Cálculos automáticos**: El subtotal y total general se calculan mediante columnas generadas y triggers
- **RLS habilitado**: Row Level Security configurado (actualmente con políticas públicas para desarrollo)

## 📁 Estructura del Proyecto

```
bakery-inventory/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Layout principal con PWA config
│   │   ├── page.tsx            # Página de inicio
│   │   ├── productos/page.tsx  # Módulo de productos
│   │   └── inventario/page.tsx # Módulo de inventario
│   ├── components/
│   │   ├── ui/                 # Componentes reutilizables
│   │   ├── productos/          # Componentes de productos
│   │   └── inventario/         # Componentes de inventario
│   ├── lib/
│   │   ├── api/                # Funciones de API para Supabase
│   │   ├── supabase.ts         # Cliente de Supabase
│   │   └── utils.ts            # Utilidades (formateo, cálculos)
│   └── types/
│       └── database.ts         # Tipos TypeScript
├── supabase/
│   └── schema.sql              # Script de creación de tablas
└── public/
    └── manifest.json           # Configuración PWA
```

##  Scripts disponibles

```bash
npm run dev      # Desarrollo con hot reload
npm run build    # Build de producción
npm run start    # Iniciar servidor de producción
npm run lint     # Ejecutar ESLint
```

##  Seguridad para Producción

Antes de desplegar a producción, actualiza las políticas RLS en Supabase:

1. Configura autenticación de usuarios
2. Modifica las políticas en `supabase/schema.sql` para restringir acceso
3. Considera añadir autenticación con Supabase Auth

##  Licencia

Proyecto privado para uso interno.
