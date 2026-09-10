import type { InjectionKey } from "vue";
import type { AuthFlowService } from "./contract";

export const AuthFlowKey: InjectionKey<AuthFlowService> = Symbol("AuthFlowService");
