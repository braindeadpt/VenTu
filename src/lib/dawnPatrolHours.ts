/** Show Dawn Patrol prominently during typical morning check window (local PT approx). */
export function isDawnPatrolWindow(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 5 && hour < 12;
}
