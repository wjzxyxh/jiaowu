import api from './api'

export const marketingService = {
  getDrafts: async () => {
    const res = await api.get('/marketing/leads', { params: { lead_status: 'draft' } })
    return res?.items ?? []
  },

  getTrials: async () => {
    const res = await api.get('/marketing/leads', { params: { lead_status: 'trial' } })
    return res?.items ?? []
  },

  getLeadById: async (id) => {
    const res = await api.get('/marketing/leads', { params: { lead_status: 'trial' } })
    const items = res?.items ?? []
    return items.find((t) => String(t.id) === String(id)) || null
  },

  getSubmitted: async () => {
    const res = await api.get('/marketing/leads', { params: { lead_status: 'submitted' } })
    return res?.items ?? []
  },

  markTrial: async (id) => {
    return api.post(`/marketing/leads/${id}/mark-trial`)
  },

  createLead: async (data) => {
    return api.post('/marketing/leads', data)
  },

  updateLead: async (id, data) => {
    return api.put(`/marketing/leads/${id}`, data)
  },

  deleteLead: async (id) => {
    return api.delete(`/marketing/leads/${id}`)
  },

  markSubmitted: async (id) => {
    return api.post(`/marketing/leads/${id}/mark-submitted`)
  },

  getTrialStatusMap: async () => {
    const res = await api.get('/marketing/leads/trial-status-map')
    return res?.items ?? []
  },
}
