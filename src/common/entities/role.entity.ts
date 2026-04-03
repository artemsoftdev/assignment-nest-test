import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { RoleName } from '../enums/role.enum.js';
import { User } from './user.entity.js';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: RoleName, unique: true })
  name: RoleName;

  @OneToMany(() => User, (user) => user.role)
  users: User[];
}
