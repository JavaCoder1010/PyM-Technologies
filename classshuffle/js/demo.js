// Optional demo classroom with made-up students, clearly labelled as a demo.
// It starts with a generated plan so there's something to look at right away.
import { createClassroom, createStudent, createRule, newId } from './model.js';
import { sortSeats } from './layout.js';
import { generateSeating } from './engine.js';

const NAMES = [
  'Ava Martin', 'Liam Chen', 'Mia Rossi', 'Noah Patel', 'Zoe Okafor', 'Ethan Novak',
  'Lucia Gómez', 'Omar Haddad', 'Chloe Dubois', 'Leo Schmidt', 'Aria Kim', 'Mateo Silva',
  'Isla Murphy', 'Kai Nakamura', 'Nora Lindqvist', 'Felix Wagner', 'Amara Mensah', 'Hugo Laurent',
  'Ivy Thompson', 'Ravi Sharma', 'Elena Petrova', 'Sam Kowalski', 'Lena Fischer', 'Theo Brooks',
];

/** @param {{ name: string }} options localized name of the demo classroom */
export function createDemoClassroom({ name }) {
  const doc = createClassroom({ name, rows: 5, desksPerRow: 3, seatsPerDesk: 2, aisles: true });
  doc.demo = true;
  doc.students = NAMES.map((n) => createStudent(n));
  const [ava, liam, mia, noah, zoe, ethan, , omar, , leo, aria] = doc.students;
  const seats = sortSeats(doc.seats);
  doc.rules = [
    createRule('apart', { studentIds: [liam.id, noah.id] }),
    createRule('apart', { studentIds: [ethan.id, omar.id, leo.id] }),
    createRule('together', { studentIds: [mia.id, zoe.id], strength: 'soft' }),
    createRule('front', { studentIds: [ava.id], params: { rows: 1 } }),
    createRule('fixed', { studentIds: [aria.id], seatIds: [seats.at(-1).id] }),
  ];
  // Start with a plan so the demo shows a seated classroom right away.
  const result = generateSeating(doc);
  if (result.ok) {
    const info = { seed: result.seed, generatedAt: doc.createdAt, uniqueness: result.uniqueness, ...result.stats };
    doc.plan = { id: newId(), createdAt: doc.createdAt, assignments: result.assignments, generated: { assignments: result.assignments, info }, edited: false };
  }
  return doc;
}
