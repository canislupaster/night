import { useContext } from 'react'
import truncate from 'truncate'
import { Post } from '../lib/api'
import ProjectCard from './project-card'
import { useTime } from './time'

const Posts = ({ posts }: { posts: Post[] }) => {
  const colors = useTime().lightningTimeColors;

  return (
    <div className="pr-8 pl-11 w-full">
      {[...posts].reverse().map((post: Post, i: number) => (
        <ProjectCard
          username={post.username}
          key={i}
          avatar={post.avatar}
          description={truncate(post.content, 90)}
          imageUrl={post.images.length ? post.images[0] : undefined}
          color={Object.values(colors)[i%colors.length]}
        />
      ))}
    </div>
  )
}

export default Posts
