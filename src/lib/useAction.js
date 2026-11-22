import { ref } from 'vue'

/**
 * Estado de un diálogo que guarda algo: ocupado, error para la persona y aviso de éxito.
 * Un conflicto de versión recarga los datos y deja el diálogo abierto con el mensaje.
 */
export function useAction(reload, messageFor) {
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')

  async function run(fn, success) {
    if (busy.value) return false
    busy.value = true
    error.value = ''
    try {
      await fn()
      notice.value = typeof success === 'function' ? success() : (success ?? '')
      await reload()
      return true
    } catch (e) {
      error.value = messageFor(e)
      if (e?.code === 'VERSION_CONFLICT') await reload()
      return false
    } finally {
      busy.value = false
    }
  }

  return { busy, error, notice, run }
}
