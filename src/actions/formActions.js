import * as api from "../services/api";

export const formActions = {
  consultarCumpleanos: async (data) => {
    return await api.get("/cumpleanos", data);
  },

  guardarCliente: async (data) => {
    return await api.post("/clientes", data);
  },

  actualizarCliente: async (data) => {
    return await api.put("/clientes", data);
  },
};
