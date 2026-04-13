import { Topic } from "../database/AthenaDb";

export interface GroupedTopics {
  label: string;
  topics: Topic[];
}

export function groupTopicsByDate(topics: Topic[]): GroupedTopics[] {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const groups: Record<string, Topic[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 Days": [],
    "Previous 30 Days": [],
    Older: [],
  };

  topics.forEach((topic) => {
    // Fallback to createdOn if updatedOn is missing for any legacy topics
    const updated = new Date(topic.updatedOn || topic.createdOn);
    if (updated >= today) {
      groups.Today.push(topic);
    } else if (updated >= yesterday) {
      groups.Yesterday.push(topic);
    } else if (updated >= sevenDaysAgo) {
      groups["Previous 7 Days"].push(topic);
    } else if (updated >= thirtyDaysAgo) {
      groups["Previous 30 Days"].push(topic);
    } else {
      groups.Older.push(topic);
    }
  });

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({
      label,
      topics: items.sort((a, b) => 
        new Date(b.updatedOn || b.createdOn).getTime() - new Date(a.updatedOn || a.createdOn).getTime()
      ),
    }));
}
