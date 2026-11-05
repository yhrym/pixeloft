import type { PluginServer } from "@/plugins/types";

const server: PluginServer = {
  state: async (ctx) => ({
    count: ((await ctx.store.get("count")) as number | undefined) ?? 0,
    placed: (await ctx.items()).length,
  }),
  actions: {
    press: (ctx) => ctx.store.update("count", (c) => ((c as number | undefined) ?? 0) + 1),
    reset: async (ctx) => {
      if (!ctx.user.isAdmin) return ctx.fail(403, "plugin.hello.adminOnly");
      await ctx.store.set("count", 0);
    },
  },
};
export default server;
