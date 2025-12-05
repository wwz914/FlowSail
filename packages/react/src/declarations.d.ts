// 声明 SCSS 文件的模块类型
declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}