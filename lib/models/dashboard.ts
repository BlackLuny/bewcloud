import Database, { sql } from '/lib/interfaces/database.ts';
import { Dashboard } from '/lib/types.ts';

const db = new Database();

export class DashboardModel {
  static async getByUserId(userId: string) {
    const dashboard =
      (await db.query<Dashboard>(sql`SELECT * FROM "bewcloud_dashboards" WHERE "user_id" = $1 LIMIT 1`, [
        userId,
      ]))[0];

    return dashboard;
  }

  static async create(userId: string) {
    const data: Dashboard['data'] = { links: [], notes: '' };

    const newDashboard = (await db.query<Dashboard>(
      sql`INSERT INTO "bewcloud_dashboards" (
        "user_id",
        "data"
      ) VALUES ($1, $2)
      RETURNING *`,
      [
        userId,
        JSON.stringify(data),
      ],
    ))[0];

    return newDashboard;
  }

  static async update(dashboard: Dashboard) {
    await db.query(
      sql`UPDATE "bewcloud_dashboards" SET
          "data" = $2
        WHERE "id" = $1`,
      [
        dashboard.id,
        JSON.stringify(dashboard.data),
      ],
    );
  }
}
