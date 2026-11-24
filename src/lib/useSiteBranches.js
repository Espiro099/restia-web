import { computed, onMounted, ref } from 'vue'
import { byDistance } from './site.js'

export function useSiteBranches(api, geolocation) {
  const list = ref([])
  const state = ref('loading')
  const assistant = ref(false)
  const user = ref(null)
  const locating = ref('idle')
  const selected = ref('')
  const branches = computed(() => byDistance(list.value, user.value))

  async function loadBranches() {
    state.value = 'loading'
    try {
      const result = await api.branches()
      list.value = result.branches
      assistant.value = result.assistant
      state.value = 'ready'
    } catch {
      state.value = 'error'
    }
  }

  function locate() {
    const service = geolocation()
    if (!service) {
      locating.value = 'unavailable'
      return
    }
    locating.value = 'asking'
    service.getCurrentPosition(({ coords }) => {
      user.value = { lat: coords.latitude, lng: coords.longitude }
      locating.value = 'idle'
      const nearest = branches.value.find((branch) => branch.distanceKm != null)
      if (nearest) selected.value = nearest.code
    }, (error) => {
      locating.value = error?.code === 1 ? 'denied' : 'unavailable'
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 })
  }

  onMounted(loadBranches)

  return { branches, state, assistant, user, locating, selected, locate, loadBranches }
}
