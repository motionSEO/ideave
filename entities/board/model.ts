export type BoardItemEntity = {
  id: string;
  imageId: string;
  x: number;
  y: number;
  zIndex: number;
};

export type BoardEntity = {
  id: string;
  items: BoardItemEntity[];
};
