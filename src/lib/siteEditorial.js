import guacamole from '../assets/sitio/guacamole.webp'
import tacos from '../assets/sitio/tacos.webp'
import arrachera from '../assets/sitio/arrachera.webp'
import churros from '../assets/sitio/churros.webp'

// Selección editorial de la carta de demostración. El menú de cada mesa conserva su catálogo por sucursal.
export const featuredDishes = [
  { name: 'Guacamole de la casa', course: 'Entrada', price: 135, image: guacamole, description: 'Aguacate machacado al momento con totopos.' },
  { name: 'Tacos al pastor', course: 'Tacos', price: 120, image: tacos, description: 'Cuatro tacos de cerdo al pastor con piña, cebolla y cilantro.' },
  { name: 'Arrachera a la parrilla', course: 'Plato fuerte', price: 295, image: arrachera, description: 'Arrachera de 300 g con frijoles charros, guacamole y tortillas.' },
  { name: 'Churros con chocolate', course: 'Postre', price: 85, image: churros, description: 'Churros con azúcar y canela y chocolate caliente para mojar.' },
]

export const siteEmail = import.meta.env.VITE_LA_MESA_CONTACT_EMAIL?.trim() || ''
