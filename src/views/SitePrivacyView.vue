<script setup>
import PublicInfoLayout from './PublicInfoLayout.vue'
import { siteEmail } from '../lib/siteEditorial.js'
</script>

<template>
  <PublicInfoLayout title="Política de privacidad">
    <div class="privacy">
      <p>La Mesa es un restaurante simulado y este sitio es parte de un proyecto estudiantil. Usa datos ficticios para probar las reservas y evita incluir información sensible.</p>

      <h2>Solicitudes y consultas de reserva</h2>
      <p>Al pedir una reserva, el sitio envía a Restia el nombre, el teléfono, la sucursal, la fecha, la hora, el número de personas y las notas que decidas agregar. La API almacena la solicitud y genera un folio. También aplica límites por dirección IP para controlar el exceso de solicitudes. El personal autorizado usa esos datos para revisar la solicitud y gestionar su estado. Para consultar una solicitud, el sitio envía la sucursal, el folio y el teléfono ingresados.</p>

      <h2>Ubicación y mapas</h2>
      <p>Si eliges «Encontrar la más cercana» y das permiso, el navegador usa tu ubicación para calcular distancias y mostrarte en el mapa. El sitio no envía las coordenadas a Restia. El navegador solicita las imágenes del mapa a OpenStreetMap. Al abrir «Cómo llegar» visitas Google Maps y se aplican sus propias condiciones.</p>

      <h2>Asistente y acceso del personal</h2>
      <p>Cuando el chat está habilitado, los mensajes que escribas se envían a Restia y a su proveedor de IA para generar una respuesta. Usa datos ficticios también en el chat. El panel del personal usa cookies de sesión y, si eliges ese método, el inicio de sesión con Google.</p>

      <h2>Conservación y opciones</h2>
      <p>Las solicitudes se conservan en el entorno de demostración para operar el sistema y reproducir pruebas. Restia tiene una tarea programada que retira datos personales de reservas antiguas. Puedes negar o retirar el permiso de ubicación desde tu navegador.</p>

      <h2>Contacto sobre tus datos</h2>
      <p v-if="siteEmail">Escribe a <a :href="'mailto:' + siteEmail">{{ siteEmail }}</a> para consultar, corregir o solicitar la eliminación de información que hayas enviado.</p>
      <p v-else>Contacta al equipo responsable de la demostración por el canal que te compartió para solicitar acceso, corrección o eliminación de datos de prueba.</p>
    </div>
  </PublicInfoLayout>
</template>

<style scoped>
.privacy { max-width: 70ch; color: var(--gray); line-height: 1.72; overflow-wrap: anywhere; }
.privacy h2 { margin-top: 30px; font-size: clamp(1.32rem, 3vw, 1.9rem); color: var(--ink); }
.privacy p { margin: 10px 0 0; }
.privacy > p:first-child { margin-top: 24px; }
</style>
