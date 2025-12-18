export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealItem = {
  itemName: string;
  assumedServing: string;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  confidence: 'low' | 'medium' | 'high';
  notes: string[];
};

export type MealEntry = {
  id: string;
  ts: number;
  mealType: MealType;
  sourceText?: string;
  items: MealItem[];
};
