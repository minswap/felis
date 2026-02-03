const DEFAULT_HEALTH_PORT = 9999;

type HealthCheckFn = () => Promise<void>;

// This is an /health API that K8s will check often, if service is unhealthy then K8s will restart it
export class HealthChecker {
  private checkers: HealthCheckFn[] = [];
  constructor(port: number = DEFAULT_HEALTH_PORT) {
    Bun.serve({
      port,
      routes: {
        "/health": async () => {
          await Promise.all(this.checkers.map((fn) => fn()));
          return new Response("ok");
        },
      },
    });
  }

  // To report unhealthy, just throw error
  public addChecker(fn: HealthCheckFn): void {
    this.checkers.push(fn);
  }
}
