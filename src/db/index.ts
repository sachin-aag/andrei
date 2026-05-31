import * as schema from "./schema";
import { createDrizzleDb } from "./connection";

export const db = createDrizzleDb(schema);
export { schema };
export { closeDbConnections, databaseUrl, isLocalDatabaseUrl } from "./connection";
