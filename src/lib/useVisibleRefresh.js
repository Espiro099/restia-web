import { onBeforeUnmount, onMounted } from 'vue'

/** Actualiza solo el módulo visible y vuelve a consultar al recuperar la conexión. */
export function useVisibleRefresh(refresh, delay) {
  let timer
  function check() {
    if (document.visibilityState === 'visible') refresh()
  }
  onMounted(() => {
    timer = setInterval(check, delay)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('focus', check)
    window.removeEventListener('online', check)
  })
}
