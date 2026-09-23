// Función para combinar clases de Tailwind de forma segura
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}

// Formatear número como moneda colombiana (sin decimales)
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

// Formatear fecha en formato legible
export function formatDate(
  date: string | Date,
  locale: string = 'es-CO'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);
}

// Formatear fecha corta
export function formatDateShort(
  date: string | Date,
  locale: string = 'es-CO'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dateObj);
}

// Obtener la fecha actual como fecha por defecto para inventario
export function getDefaultInventoryDate(): Date {
  return new Date();
}

// Convertir fecha a formato ISO para inputs de tipo date
export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Validar que una cadena sea un número válido
export function isValidNumber(value: string): boolean {
  const num = parseFloat(value);
  return !isNaN(num) && isFinite(num) && num >= 0;
}

// Redondear a 2 decimales
export function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// Debounce function para optimizar búsquedas
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

// Generar ID único simple (para uso temporal en UI)
export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Calcular subtotal
export function calculateSubtotal(cantidad: number, precio: number): number {
  return roundToTwo(cantidad * precio);
}

// Calcular total general de un array de items con subtotal
export function calculateTotal(
  items: Array<{ subtotal: number }>
): number {
  return roundToTwo(items.reduce((acc, item) => acc + item.subtotal, 0));
}
