/** public/ 파일 경로에 basePath를 붙인다 (정적 내보내기에서는 next/image 대신 이걸 쓴다) */
export function asset(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`;
}
